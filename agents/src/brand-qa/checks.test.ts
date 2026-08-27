import { describe, expect, it } from 'vitest';
import { makeTestClient } from '../test-fixtures.js';
import {
  checkForbiddenPhrases,
  checkPreferredPhrasesUsage,
  checkInventedPhoneNumbers,
  checkInventedPrices,
  checkInventedLocations,
  checkCtaAccuracy,
  checkHashtagFormat,
  checkAiSoundingLanguage,
  checkExcessiveRepetition,
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
    const client = makeTestClient();
    client.core.phone = '(208) 555-0142';
    const issues = checkInventedPhoneNumbers('Call us at (208) 555-0142 today.', client);
    expect(issues).toHaveLength(0);
  });

  it('flags a phone number that does not match the client profile', () => {
    const client = makeTestClient();
    client.core.phone = '(208) 555-0142';
    const issues = checkInventedPhoneNumbers('Call us at (555) 123-9999 today.', client);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('INVENTED_PHONE_NUMBER');
  });

  it('flags any phone number when the client has none on file', () => {
    const client = makeTestClient();
    client.core.phone = null;
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
    const client = makeTestClient();
    client.offers = [
      {
        id: 'offer_special',
        clientId: client.core.id,
        offerName: 'Special',
        description: 'Only $99 this month',
        cta: null,
        restrictions: null,
        active: true,
        startDate: null,
        endDate: null,
        createdAt: client.core.createdAt,
        updatedAt: client.core.updatedAt,
      },
    ];
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

describe('checkPreferredPhrasesUsage', () => {
  it('warns when the client has preferred phrases but none appear', () => {
    const client = makeTestClient();
    const issues = checkPreferredPhrasesUsage('A generic post with no branded language.', client);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
  });

  it('passes when a preferred phrase is used', () => {
    const client = makeTestClient();
    const issues = checkPreferredPhrasesUsage('We are locally owned and operated.', client);
    expect(issues).toHaveLength(0);
  });

  it('is silent when the client has no preferred phrases defined', () => {
    const client = makeTestClient({ brandProfile: null });
    const issues = checkPreferredPhrasesUsage('Anything goes here.', client);
    expect(issues).toHaveLength(0);
  });
});

describe('checkInventedLocations', () => {
  it("allows the client's real service area", () => {
    const client = makeTestClient();
    const issues = checkInventedLocations("We're proud to serve Coeur d'Alene, ID and the surrounding area.", client);
    expect(issues).toHaveLength(0);
  });

  it('flags a location not in the client profile', () => {
    const client = makeTestClient();
    const issues = checkInventedLocations('Now serving customers in Springfield, IL too!', client);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('INVENTED_LOCATION');
    expect(issues[0]?.severity).toBe('blocking');
  });
});

describe('checkCtaAccuracy', () => {
  it("flags a call-to-action referencing a phone number the client doesn't have on file", () => {
    const client = makeTestClient({ core: { ...makeTestClient().core, phone: null } });
    const issues = checkCtaAccuracy('Call us today!', client);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('CTA_UNSUPPORTED_PHONE');
  });

  it('allows a phone-referencing CTA when the client has a phone number on file', () => {
    const client = makeTestClient();
    const issues = checkCtaAccuracy('Call us today!', client);
    expect(issues).toHaveLength(0);
  });

  it('flags a website-referencing CTA when the client has no website on file', () => {
    const client = makeTestClient({ core: { ...makeTestClient().core, website: null } });
    const issues = checkCtaAccuracy('Visit our website to learn more.', client);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('CTA_UNSUPPORTED_WEBSITE');
  });

  it('is silent when there is no CTA', () => {
    const client = makeTestClient();
    expect(checkCtaAccuracy(null, client)).toHaveLength(0);
  });
});

describe('checkHashtagFormat', () => {
  it('flags a malformed hashtag', () => {
    const issues = checkHashtagFormat(['#Valid', 'has a space'], 'FACEBOOK');
    expect(issues.some((i) => i.code === 'MALFORMED_HASHTAG')).toBe(true);
  });

  it('warns (not blocks) when there are more hashtags than typical for the platform', () => {
    const issues = checkHashtagFormat(['#a', '#b', '#c', '#d', '#e'], 'FACEBOOK');
    const excessive = issues.find((i) => i.code === 'EXCESSIVE_HASHTAGS');
    expect(excessive?.severity).toBe('warning');
  });

  it('is silent for a small number of well-formed hashtags', () => {
    expect(checkHashtagFormat(['#Local', '#Trusted'], 'FACEBOOK')).toHaveLength(0);
  });
});

describe('checkExcessiveRepetition', () => {
  it('flags a word repeated an unusual number of times', () => {
    const content = 'Septic septic septic septic install is what we do, septic septic.';
    const issues = checkExcessiveRepetition(content);
    expect(issues.some((i) => i.code === 'EXCESSIVE_REPETITION')).toBe(true);
    expect(issues[0]?.severity).toBe('warning');
  });

  it('is silent for normal, non-repetitive content', () => {
    const content = 'We just finished a septic installation for a happy customer in the area.';
    expect(checkExcessiveRepetition(content)).toHaveLength(0);
  });
});
