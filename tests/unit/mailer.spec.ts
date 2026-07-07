import { describe, expect, it } from 'vitest';
import {
  confirmEmailMessage,
  dailyDigestMessage,
  passwordResetMessage,
  ResendMailer,
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

  it('throws with status and trimmed body on a non-2xx response', async () => {
    const { fetchImpl } = stubFetch(422, '{"message":"invalid from"}');
    const mailer = new ResendMailer(OPTIONS, fetchImpl);
    await expect(
      mailer.send({ to: 'user@example.com', subject: 'Hi', text: 'Hello' }),
    ).rejects.toThrow(/status 422.*invalid from/);
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
});
