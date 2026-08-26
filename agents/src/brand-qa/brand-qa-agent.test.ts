import { describe, expect, it } from 'vitest';
import { makeTestClient } from '../test-fixtures.js';
import { BrandQaAgent } from './brand-qa-agent.js';

describe('BrandQaAgent', () => {
  const agent = new BrandQaAgent();
  const context = {
    client: makeTestClient(),
    actor: { id: 'test', label: 'Test Actor' },
    requestId: 'req-1',
  };

  it('passes clean, on-brand content', async () => {
    const result = await agent.run({ body: 'We are locally owned and operated. Call (208) 555-0142.' }, context);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('fails content with a forbidden phrase', async () => {
    const result = await agent.run({ body: 'We are the best in the world!' }, context);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'FORBIDDEN_PHRASE')).toBe(true);
  });

  it('fails content with an invented phone number', async () => {
    const result = await agent.run({ body: 'Call us right now at (555) 999-1234!' }, context);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'INVENTED_PHONE_NUMBER')).toBe(true);
  });
});
