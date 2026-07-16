import { describe, expect, it, vi } from 'vitest';
import {
  confirmEmailMessage,
  ConsoleMailer,
  createMailer,
  dailyDigestMessage,
  passwordResetMessage,
  ResendMailer,
  sendMailBestEffort,
} from '../../server/utils/mailer';

const OPTIONS = {
  apiUrl: 'https://api.resend.test/emails',
  apiKey: 'test-key',
  from: 'NeedyPet <no-reply@needypet.test>',
};

function stubFetch(status: number, body = '') {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body, { status });
  }) as typeof globalThis.fetch;
  return { fetchImpl, calls };
}

describe('ResendMailer', () => {
  it('POSTs the message to the API with auth header and from address', async () => {
    const { fetchImpl, calls } = stubFetch(200);
    const mailer = new ResendMailer(OPTIONS, fetchImpl);
    await mailer.send({ to: 'user@example.com', subject: 'Hi', text: 'Hello there' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(OPTIONS.apiUrl);
    expect(calls[0]!.init.method).toBe('POST');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      from: OPTIONS.from,
      to: 'user@example.com',
      subject: 'Hi',
      text: 'Hello there',
    });
  });

  it('resolves on a 2xx response', async () => {
    const { fetchImpl } = stubFetch(200, '{"id":"abc"}');
    const mailer = new ResendMailer(OPTIONS, fetchImpl);
    await expect(
      mailer.send({ to: 'user@example.com', subject: 'Hi', text: 'Hello' }),
    ).resolves.toBeUndefined();
  });

  it('throws with status but not the provider response body on a non-2xx response', async () => {
    const { fetchImpl } = stubFetch(422, '{"message":"invalid from"}');
    const mailer = new ResendMailer(OPTIONS, fetchImpl);
    await expect(
      mailer.send({ to: 'user@example.com', subject: 'Hi', text: 'Hello' }),
    ).rejects.toThrow('Mailer request failed with status 422');
  });

  it('aborts a stalled provider request at the configured deadline', async () => {
    let requestSignal: AbortSignal | null = null;
    const stalledFetch = ((_url: unknown, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
      });
    }) as typeof globalThis.fetch;
    const mailer = new ResendMailer(OPTIONS, stalledFetch, 5);

    await expect(
      mailer.send({ to: 'user@example.com', subject: 'Hi', text: 'Hello' }),
    ).rejects.toThrow();
    expect(requestSignal?.aborted).toBe(true);
  });
});

describe('mailer configuration', () => {
  it('allows the console mailer only outside production', () => {
    expect(createMailer({ ...OPTIONS, provider: '' }, false)).toBeInstanceOf(ConsoleMailer);
    expect(() => createMailer({ ...OPTIONS, provider: '' }, true)).toThrow(
      'NUXT_MAILER_PROVIDER=resend is required in production',
    );
  });

  it('requires complete Resend credentials and HTTPS outside loopback in production', () => {
    expect(() =>
      createMailer({ provider: 'resend', apiUrl: OPTIONS.apiUrl, apiKey: '', from: OPTIONS.from }, true),
    ).toThrow('NUXT_MAILER_API_KEY');
    expect(() =>
      createMailer({ ...OPTIONS, provider: 'resend', apiUrl: 'http://api.example.com/emails' }, true),
    ).toThrow('HTTPS');
  });

  it('allows a loopback Resend endpoint for the production integration server', () => {
    expect(
      createMailer({ ...OPTIONS, provider: 'resend', apiUrl: 'http://127.0.0.1:43123/emails' }, true),
    ).toBeInstanceOf(ResendMailer);
  });

  it('logs no recipient or provider body when optional delivery fails', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = new ResendMailer(OPTIONS, stubFetch(422, 'private@example.com token=secret').fetchImpl);
    const sent = await sendMailBestEffort(
      failing,
      { to: 'private@example.com', subject: 'Hi', text: 'token=secret' },
      'test-mail',
    );
    expect(sent).toBe(false);
    expect(logger).toHaveBeenCalledWith('[test-mail] Email delivery failed (provider status 422)');
    expect(JSON.stringify(logger.mock.calls)).not.toContain('private@example.com');
    expect(JSON.stringify(logger.mock.calls)).not.toContain('token=secret');
    logger.mockRestore();
  });
});

describe('message builders', () => {
  it('confirmEmailMessage carries the recipient and the link', () => {
    const message = confirmEmailMessage('user@example.com', 'https://app.test/confirm-email?token=t1');
    expect(message.to).toBe('user@example.com');
    expect(message.text).toContain('https://app.test/confirm-email?token=t1');
    expect(message.subject.toLowerCase()).toContain('confirm');
  });

  it('passwordResetMessage carries the recipient and the link', () => {
    const message = passwordResetMessage('user@example.com', 'https://app.test/reset-password?token=t2');
    expect(message.to).toBe('user@example.com');
    expect(message.text).toContain('https://app.test/reset-password?token=t2');
    expect(message.subject.toLowerCase()).toContain('reset');
  });

  it('dailyDigestMessage lists each pet with its open tasks and the home link', () => {
    const message = dailyDigestMessage(
      'owner@example.com',
      [
        { petName: 'Bella', needs: [{ category: 'Fresh water', description: '' }, { category: 'Evening walk', description: '' }] },
        { petName: 'Misty', needs: [{ category: 'Breakfast', description: '' }] },
      ],
      'https://app.test/home',
    );
    expect(message.to).toBe('owner@example.com');
    expect(message.subject).toContain('🐾');
    expect(message.text).toContain('Bella — Fresh water, Evening walk');
    expect(message.text).toContain('Misty — Breakfast');
    expect(message.text).toContain('https://app.test/home');
  });

  it('dailyDigestMessage localizes the copy to the recipient locale (fi)', () => {
    const sections = [{ petName: 'Bella', needs: [{ category: 'Fresh water', description: '' }] }];
    const en = dailyDigestMessage('o@example.com', sections, 'https://app.test/home', 'en');
    const fi = dailyDigestMessage('o@example.com', sections, 'https://app.test/home', 'fi');

    // Subject and framing copy differ by locale...
    expect(en.subject).toBe('Your pets still need you today 🐾');
    expect(fi.subject).toBe('Lemmikkisi tarvitsevat sinua vielä tänään 🐾');
    expect(fi.text).toContain('Muutama hoitohetki odottaa vielä:');
    // ...but the pet/category data (user-authored) is untranslated, and the
    // link is unchanged.
    expect(fi.text).toContain('Bella — Fresh water');
    expect(fi.text).toContain('https://app.test/home');
  });
});
