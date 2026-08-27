import { describe, expect, it } from 'vitest';
import { NotConfiguredError } from '@citadel/shared';
import { createModelProvider } from './factory.js';
import { MockModelProvider } from './mock-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';

describe('createModelProvider', () => {
  it('returns the mock provider by default', () => {
    const provider = createModelProvider({});
    expect(provider).toBeInstanceOf(MockModelProvider);
  });

  it('returns the mock provider when explicitly requested', () => {
    const provider = createModelProvider({ provider: 'mock' });
    expect(provider).toBeInstanceOf(MockModelProvider);
  });

  it('throws NotConfiguredError when anthropic is requested without an API key', () => {
    expect(() => createModelProvider({ provider: 'anthropic' })).toThrow(NotConfiguredError);
  });

  it('returns an AnthropicProvider when a key is supplied', () => {
    const provider = createModelProvider({ provider: 'anthropic', anthropicApiKey: 'sk-test-fake-key' });
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.capabilities).toEqual({ structuredOutput: true, toolCalling: false });
  });
});
