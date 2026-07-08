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

/**
 * Dev mailer: prints the message to the server console so the links are
 * copy-pasteable locally. A production adapter (SMTP/API) plugs in here,
 * switched on runtime config, without touching any calling code.
 */
class ConsoleMailer implements Mailer {
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
    });
    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`Mailer request failed with status ${response.status}: ${body}`);
    }
  }
}

let mailer: Mailer | null = null;

export function useMailer(): Mailer {
  if (!mailer) {
    const config = useRuntimeConfig().mailer;
    if (config.provider === 'resend' && config.apiKey && config.from) {
      mailer = new ResendMailer({ apiUrl: config.apiUrl, apiKey: config.apiKey, from: config.from });
    } else {
      if (!import.meta.dev) {
        console.warn('[mailer] No production mailer configured — mail goes to the console only.');
      }
      mailer = new ConsoleMailer();
    }
  }
  return mailer;
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
