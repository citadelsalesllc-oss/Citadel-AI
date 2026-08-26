import { describe, expect, it } from 'vitest';
import { MockModelProvider } from './mock-provider.js';

describe('MockModelProvider', () => {
  it('is deterministic for the same input', async () => {
    const provider = new MockModelProvider();
    const params = {
      system: 'You are a content agent.',
      messages: [{ role: 'user' as const, content: 'Instruction: Say hello.\nCompany: Acme Co' }],
    };

    const first = await provider.generate(params);
    const second = await provider.generate(params);

    expect(first.text).toBe(second.text);
    expect(first.provider).toBe('mock');
  });

  it('extracts labeled fields from the structured prompt', async () => {
    const provider = new MockModelProvider();
    const result = await provider.generate({
      system: 'system',
      messages: [
        {
          role: 'user',
          content: 'Instruction: Announce a sale.\nCompany: Acme Co\nPhone: (555) 000-1111',
        },
      ],
    });

    expect(result.text).toContain('Acme Co');
    expect(result.text).toContain('(555) 000-1111');
  });
});
