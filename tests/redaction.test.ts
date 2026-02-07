import { describe, expect, test } from 'bun:test';
import { redactSensitiveText, redactSensitiveValue, stringifyRedacted } from '../src/utils/redaction.ts';

describe('redaction', () => {
  test('masks bearer tokens and common key patterns', () => {
    const input = 'Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz token=secret-token api_key=my-api-key password=hunter2';
    const output = redactSensitiveText(input);

    expect(output).toContain('Bearer ');
    expect(output).toContain('***');
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('my-api-key');
    expect(output).not.toContain('hunter2');
  });

  test('redacts nested object values by key hint', () => {
    const value = {
      token: 'abcd1234efgh5678',
      nested: {
        password: 'topsecret',
        safe: 'hello',
      },
      list: [
        { apiKey: 'sk-very-secret-key' },
      ],
    };

    const redacted = redactSensitiveValue(value) as {
      token: string;
      nested: { password: string; safe: string };
      list: Array<{ apiKey: string }>;
    };

    expect(redacted.token).toContain('***');
    expect(redacted.nested.password).toContain('***');
    expect(redacted.nested.safe).toBe('hello');
    expect(redacted.list[0]?.apiKey).toContain('***');
  });

  test('stringifyRedacted returns compact safe summaries', () => {
    const summary = stringifyRedacted({
      command: 'curl https://api.example.com?token=abcdef123456',
      auth: 'Bearer sk-abcdefghijklmnopqrstuvwxyz',
    }, 80);

    expect(summary.length).toBeLessThanOrEqual(80);
    expect(summary).toContain('***');
    expect(summary).not.toContain('abcdef123456');
  });
});
