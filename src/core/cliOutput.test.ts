import { describe, expect, it } from 'vitest';
import { parseJsonText, stripAnsi } from './cliOutput';

describe('OpenSpec CLI output parsing', () => {
  it('removes terminal escapes and parses labeled JSON output', () => {
    expect(stripAnsi('\u001b[32mok\u001b[0m')).toBe('ok');
    expect(parseJsonText<{ ready: boolean }>('OpenSpec result:\n{"ready":true}')).toEqual({ ready: true });
  });

  it('rejects malformed JSON', () => {
    expect(() => parseJsonText('not-json')).toThrow(/invalid JSON/i);
  });
});
