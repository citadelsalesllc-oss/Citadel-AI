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

  function input(overrides: Partial<{ content: string; hashtags: string[]; cta: string | null; platform: string }>) {
    return { content: '', hashtags: [], cta: null, platform: 'FACEBOOK', ...overrides };
  }

  it('passes clean, on-brand content', async () => {
    const result = await agent.run(
      input({ content: 'We are locally owned and operated.', cta: 'Call (208) 555-0142.' }),
      context,
    );
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('fails content with a forbidden phrase', async () => {
    const result = await agent.run(input({ content: 'We are the best in the world!' }), context);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'FORBIDDEN_PHRASE')).toBe(true);
  });

  it('fails content with an invented phone number', async () => {
    const result = await agent.run(input({ content: 'Call us right now at (555) 999-1234!' }), context);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'INVENTED_PHONE_NUMBER')).toBe(true);
  });

  it('fails content with an invented location', async () => {
    const result = await agent.run(input({ content: 'Now serving Springfield, IL!' }), context);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'INVENTED_LOCATION')).toBe(true);
  });

  it('fails content whose CTA implies an unsupported channel', async () => {
    const noWebsiteContext = {
      ...context,
      client: makeTestClient({ core: { ...makeTestClient().core, website: null } }),
    };
    const result = await agent.run(
      input({ content: 'Great news for our customers.', cta: 'Visit our website today.' }),
      noWebsiteContext,
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'CTA_UNSUPPORTED_WEBSITE')).toBe(true);
  });

  it('separates blocking issues from non-blocking warnings and still passes on warnings alone', async () => {
    // AI-cliché language is a warning, not blocking, and the client has no
    // preferred phrases used either (another warning) — content should
    // still pass.
    const result = await agent.run(
      input({ content: "In today's fast-paced world, we get the job done." }),
      context,
    );
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === 'AI_SOUNDING_LANGUAGE')).toBe(true);
  });
});
