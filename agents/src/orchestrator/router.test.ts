import { describe, expect, it } from 'vitest';
import { classifyRequest } from './router.js';

describe('classifyRequest', () => {
  it('routes Facebook post requests to the content skill', () => {
    const decision = classifyRequest('Create a Facebook post about a septic installation.');
    expect(decision).toEqual({ type: 'content-skill', platform: 'facebook' });
  });

  it('routes Instagram requests to the content skill with the instagram platform', () => {
    const decision = classifyRequest('Write an Instagram caption for our new truck.');
    expect(decision).toEqual({ type: 'content-skill', platform: 'instagram' });
  });

  it('routes Google Business requests to the content skill with the google_business platform', () => {
    const decision = classifyRequest('Post an update to our Google Business profile.');
    expect(decision).toEqual({ type: 'content-skill', platform: 'google_business' });
  });

  it('routes SEO audit requests to the seo-agent', () => {
    const decision = classifyRequest('Run an SEO audit on our homepage.');
    expect(decision).toEqual({ type: 'agent', agentName: 'seo-agent' });
  });

  it('routes review response requests to the review-agent', () => {
    const decision = classifyRequest('Draft a review response for our latest 1-star review.');
    expect(decision).toEqual({ type: 'agent', agentName: 'review-agent' });
  });

  it('routes website audit requests to the website-agent', () => {
    const decision = classifyRequest('Do a website audit for conversion issues.');
    expect(decision).toEqual({ type: 'agent', agentName: 'website-agent' });
  });

  it('routes marketing strategy requests to the strategy-agent', () => {
    const decision = classifyRequest('Help me plan a marketing strategy for next quarter.');
    expect(decision).toEqual({ type: 'agent', agentName: 'strategy-agent' });
  });

  it('routes analytics requests to the analytics-agent', () => {
    const decision = classifyRequest('Give me a marketing report for last month.');
    expect(decision).toEqual({ type: 'agent', agentName: 'analytics-agent' });
  });

  it('reports unsupported requests explicitly rather than guessing', () => {
    const decision = classifyRequest('What is the weather today?');
    expect(decision.type).toBe('unsupported');
    if (decision.type === 'unsupported') {
      expect(decision.reason).toContain('Could not determine');
    }
  });
});
