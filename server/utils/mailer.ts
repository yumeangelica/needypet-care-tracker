import type { Locale } from '#shared/types/domain';
import type { DigestPetSection } from '#shared/utils/digest';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface MailerConfig {
  provider: string;
  apiUrl: string;
  apiKey: string;
  from: string;
}

const MAILER_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Dev mailer: prints the message to the server console so the links are
 * copy-pasteable locally. A production adapter (SMTP/API) plugs in here,
 * switched on runtime config, without touching any calling code.
 */
export class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    console.log(
      [
        '',
        '┌── NeedyPet mail ─────────────────────────────',
        `│ To:      ${message.to}`,
        `│ Subject: ${message.subject}`,
        '├──────────────────────────────────────────────',
        ...message.text.split('\n').map((line) => `│ ${line}`),
        '└──────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
  }
}

/**
 * Production mailer: plain fetch against a Resend-style HTTP API — no SMTP
 * dependency. `fetchImpl` is injectable so unit tests can stub the network.
 */
export class ResendMailer implements Mailer {
  constructor(
    private readonly options: { apiUrl: string; apiKey: string; from: string },
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
    private readonly timeoutMs = MAILER_REQUEST_TIMEOUT_MS,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await this.fetchImpl(this.options.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.options.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new MailerDeliveryError(response.status);
    }
  }
}

class MailerDeliveryError extends Error {
  constructor(readonly status: number) {
    super(`Mailer request failed with status ${status}`);
  }
}

let mailer: Mailer | null = null;

export function useMailer(): Mailer {
  if (!mailer) {
    const config = useRuntimeConfig().mailer;
    mailer = createMailer(config, process.env.NODE_ENV === 'production');
  }
  return mailer;
}

export function createMailer(
  config: MailerConfig,
  isProduction: boolean,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Mailer {
  const provider = config.provider.trim();
  if (!provider) {
    if (isProduction) {
      throw new Error('NUXT_MAILER_PROVIDER=resend is required in production');
    }
    return new ConsoleMailer();
  }
  if (provider !== 'resend') {
    throw new Error(`Unsupported mailer provider: ${provider}`);
  }
  if (!config.apiKey.trim() || !config.from.trim()) {
    throw new Error('NUXT_MAILER_API_KEY and NUXT_MAILER_FROM are required for Resend');
  }

  const apiUrl = new URL(config.apiUrl);
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(apiUrl.hostname);
  if (
    !['http:', 'https:'].includes(apiUrl.protocol) ||
    apiUrl.username ||
    apiUrl.password ||
    (isProduction && apiUrl.protocol !== 'https:' && !loopback)
  ) {
    throw new Error('Mailer API URL must be a credential-free HTTPS URL in production');
  }

  return new ResendMailer(
    { apiUrl: apiUrl.toString(), apiKey: config.apiKey, from: config.from },
    fetchImpl,
  );
}

/** Sends optional mail without leaking recipient, token or provider response data. */
export async function sendMailBestEffort(
  targetMailer: Mailer,
  message: MailMessage,
  context: string,
): Promise<boolean> {
  try {
    await targetMailer.send(message);
    return true;
  } catch (error) {
    const status = error instanceof MailerDeliveryError ? ` (provider status ${error.status})` : '';
    console.error(`[${context}] Email delivery failed${status}`);
    return false;
  }
}

export function confirmEmailMessage(to: string, link: string): MailMessage {
  return {
    to,
    subject: 'Confirm your NeedyPet email 🐾',
    text: [
      'Welcome to the pack!',
      '',
      'Confirm your email address by opening this link:',
      link,
      '',
      'The link is valid for 24 hours. If you did not create a NeedyPet',
      'account, you can ignore this message.',
    ].join('\n'),
  };
}

export function passwordResetMessage(to: string, link: string): MailMessage {
  return {
    to,
    subject: 'Reset your NeedyPet paw code 🐾',
    text: [
      'Someone asked to reset the password for this email address.',
      '',
      'Set a new password by opening this link:',
      link,
      '',
      'The link is valid for 1 hour. If this was not you, you can safely',
      'ignore this message — your password stays unchanged.',
    ].join('\n'),
  };
}

/**
 * Localized copy for the daily digest. Confirmation/reset mails stay English
 * (they can go out before a user has chosen a language); the digest is sent to
 * an established account, so it follows the recipient's saved locale.
 */
const digestCopy: Record<Locale, { subject: string; intro: string; open: string; footer: string[] }> = {
  en: {
    subject: 'Your pets still need you today 🐾',
    intro: 'A few care moments are still waiting:',
    open: 'Open NeedyPet to log them:',
    footer: [
      'You get this because daily reminders are on. Turn them off any time',
      'from your profile.',
    ],
  },
  fi: {
    subject: 'Lemmikkisi tarvitsevat sinua vielä tänään 🐾',
    intro: 'Muutama hoitohetki odottaa vielä:',
    open: 'Avaa NeedyPet ja kirjaa ne:',
    footer: [
      'Saat tämän, koska päivittäiset muistutukset ovat päällä. Voit kytkeä',
      'ne pois milloin tahansa profiilistasi.',
    ],
  },
};

/**
 * The daily nudge about unfinished care tasks. One line per pet listing the
 * categories still waiting today. Callers only build this when there is at
 * least one open task across the recipient's pets. Copy follows the recipient's
 * locale (defaulting to English).
 */
export function dailyDigestMessage(
  to: string,
  sections: DigestPetSection[],
  homeLink: string,
  locale: Locale = 'en',
): MailMessage {
  const copy = digestCopy[locale] ?? digestCopy.en;
  const petLines = sections.map(
    (section) => `• ${section.petName} — ${section.needs.map((need) => need.category).join(', ')}`,
  );
  return {
    to,
    subject: copy.subject,
    text: [
      copy.intro,
      '',
      ...petLines,
      '',
      copy.open,
      homeLink,
      '',
      ...copy.footer,
    ].join('\n'),
  };
}
