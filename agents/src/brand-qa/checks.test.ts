import { describe, expect, it } from 'vitest';
import { makeTestClient } from '../test-fixtures.js';
import {
  checkForbiddenPhrases,
  checkInventedPhoneNumbers,
  checkInventedPrices,
  checkAiSoundingLanguage,
  checkNotEmpty,
} from './checks.js';

describe('checkForbiddenPhrases', () => {
  it('flags text containing a forbidden phrase', () => {
    const client = makeTestClient();
    const issues = checkForbiddenPhrases('We are the best in the world at this!', client);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('blocking');
  });

  it('passes clean text', () => {
    const client = makeTestClient();
    const issues = checkForbiddenPhrases('We are locally owned and operated.', client);
    expect(issues).toHaveLength(0);
  });
});

describe('checkInventedPhoneNumbers', () => {
  it('allows the client\'s real phone number', () => {
    const client = makeTestClient({ phone: '(208) 555-0142' });
    const issues = checkInventedPhoneNumbers('Call us at (208) 555-0142 today.', client);
    expect(issues).toHaveLength(0);
  });

  it('flags a phone number that does not match the client profile', () => {
    const client = makeTestClient({ phone: '(208) 555-0142' });
    const issues = checkInventedPhoneNumbers('Call us at (555) 123-9999 today.', client);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('INVENTED_PHONE_NUMBER');
  });

  it('flags any phone number when the client has none on file', () => {
    const client = makeTestClient({ phone: undefined });
    const issues = checkInventedPhoneNumbers('Call us at (555) 123-9999 today.', client);
    expect(issues).toHaveLength(1);
  });
});

describe('checkInventedPrices', () => {
  it('flags a price not present anywhere in the client profile', () => {
    const client = makeTestClient();
    const issues = checkInventedPrices('Installs starting at just $99!', client);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('INVENTED_PRICE');
  });

  it('allows a price that is present in the client profile', () => {
    const client = makeTestClient({
      offers: [{ name: 'Special', description: 'Only $99 this month' }],
    });
    const issues = checkInventedPrices('Get our special for $99 this month!', client);
    expect(issues).toHaveLength(0);
  });
});

describe('checkAiSoundingLanguage', () => {
  it('flags generic AI clichés as warnings, not blocking', () => {
    const issues = checkAiSoundingLanguage("In today's fast-paced world, we deliver.");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
  });
});

describe('checkNotEmpty', () => {
  it('flags empty content as blocking', () => {
    const issues = checkNotEmpty('   ');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('blocking');
  });
});
