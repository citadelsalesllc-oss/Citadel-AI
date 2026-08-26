import { describe, expect, it } from 'vitest';
import { MockModelProvider } from '@citadel/integrations/models';
import { makeTestClient } from '../test-fixtures.js';
import { ContentAgent } from './content-agent.js';

describe('ContentAgent', () => {
  it('generates content mentioning only facts present on the client profile', async () => {
    const agent = new ContentAgent(new MockModelProvider());
    const client = makeTestClient();

    const result = await agent.run(
      { platform: 'facebook', instruction: 'Announce our new widget installation service.' },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-1' },
    );

    expect(result.body.length).toBeGreaterThan(0);
    expect(result.body).toContain('Test Client Co');
    expect(result.contentType).toBe('SOCIAL_POST');
    expect(result.providerUsed).toBe('mock');
    // Never invents a phone number that isn't the client's.
    expect(result.body).not.toMatch(/\(555\)/);
  });

  it('maps platforms to the correct content type', async () => {
    const agent = new ContentAgent(new MockModelProvider());
    const client = makeTestClient();
    const context = { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-2' };

    const instagram = await agent.run({ platform: 'instagram', instruction: 'Share a photo update.' }, context);
    expect(instagram.contentType).toBe('INSTAGRAM_CAPTION');

    const gbp = await agent.run({ platform: 'google_business', instruction: 'Post a service update.' }, context);
    expect(gbp.contentType).toBe('GOOGLE_BUSINESS_POST');
  });
});
