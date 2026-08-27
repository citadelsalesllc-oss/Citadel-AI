import { describe, expect, it } from 'vitest';
import { MockModelProvider } from './mock-provider.js';

describe('MockModelProvider', () => {
  it('reports its capabilities', () => {
    const provider = new MockModelProvider();
    expect(provider.capabilities).toEqual({ structuredOutput: true, toolCalling: false });
  });

  it('is deterministic for the same input', async () => {
    const provider = new MockModelProvider();
    const params = {
      system: 'You are a content agent.',
      messages: [{ role: 'user' as const, content: 'Company: Acme Co\n<topic>\nSay hello\n</topic>' }],
    };

    const first = await provider.generate(params);
    const second = await provider.generate(params);

    expect(first.text).toBe(second.text);
    expect(first.provider).toBe('mock');
  });

  it('extracts labeled fields and the topic block from the structured prompt', async () => {
    const provider = new MockModelProvider();
    const result = await provider.generate({
      system: 'system',
      messages: [
        {
          role: 'user',
          content: 'Company: Acme Co\nService area: Springfield\n<topic>\nAnnounce a sale\n</topic>',
        },
      ],
    });

    expect(result.text).toContain('Acme Co');
    expect(result.text).toContain('Springfield');
  });

  it('returns a valid structured object when responseSchema is requested', async () => {
    const provider = new MockModelProvider();
    const result = await provider.generate({
      system: 'system',
      messages: [
        {
          role: 'user',
          content:
            'Platform: FACEBOOK\nCompany: Acme Co\nPhone: (555) 000-1111\nServices: Widget Install - We install widgets\n<topic>\nA new widget install\n</topic>',
        },
      ],
      responseSchema: { type: 'object' },
    });

    expect(result.structured).toBeDefined();
    const structured = result.structured as Record<string, unknown>;
    expect(structured.platform).toBe('FACEBOOK');
    expect(typeof structured.content).toBe('string');
    expect(Array.isArray(structured.hashtags)).toBe(true);
    expect(structured.cta).toBe('Call (555) 000-1111 to get started.');
    // result.text must be the JSON serialization of the same object, not freeform prose.
    expect(JSON.parse(result.text)).toEqual(structured);
  });

  it('omits `structured` when no responseSchema was requested', async () => {
    const provider = new MockModelProvider();
    const result = await provider.generate({
      system: 'system',
      messages: [{ role: 'user', content: '<topic>\nhello\n</topic>' }],
    });
    expect(result.structured).toBeUndefined();
  });
});
