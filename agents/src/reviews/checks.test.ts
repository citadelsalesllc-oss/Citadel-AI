import { describe, expect, it } from 'vitest';
import type { Review } from '@citadel/shared';
import { makeTestClient } from '../test-fixtures.js';
import { analyzeReview } from './checks.js';

function makeReview(overrides: Partial<Review> = {}): Review {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'review_test_1',
    clientId: 'client_test_1',
    externalId: 'ext-1',
    source: 'MOCK',
    reviewerName: 'T.C.',
    rating: 5,
    reviewText: 'Great experience.',
    reviewDate: now,
    responseStatus: 'UNRESPONDED',
    responseText: null,
    responseDate: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('analyzeReview', () => {
  it('classifies a clean 5-star review as positive', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 5, reviewText: 'Excellent service, very professional and on time.' });
    const result = analyzeReview(review, client);
    expect(result.classification).toBe('positive');
    expect(result.rating).toBe(5);
    expect(result.positivePoints.length).toBeGreaterThan(0);
    expect(result.escalationNeeded).toBe(false);
  });

  it('classifies a clean 1-star review with complaint language as negative', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 1, reviewText: 'Terrible, unprofessional, and overcharged us.' });
    const result = analyzeReview(review, client);
    expect(result.classification).toBe('negative');
    expect(result.negativePoints.length).toBeGreaterThan(0);
  });

  it('classifies a review with both praise and complaint language as mixed', () => {
    const client = makeTestClient();
    const review = makeReview({
      rating: 3,
      reviewText: 'The technician was friendly and professional, but I was disappointed the job took overcharged pricing.',
    });
    const result = analyzeReview(review, client);
    expect(result.classification).toBe('mixed');
    expect(result.positivePoints.length).toBeGreaterThan(0);
    expect(result.negativePoints.length).toBeGreaterThan(0);
  });

  it('classifies a neutral 3-star review with no strong signals as neutral', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 3, reviewText: 'It was okay, nothing special.' });
    const result = analyzeReview(review, client);
    expect(result.classification).toBe('neutral');
  });

  it('extracts a mentioned service from the client context', () => {
    const client = makeTestClient();
    const review = makeReview({ reviewText: 'Great widget installation, very happy with the results.' });
    const result = analyzeReview(review, client);
    expect(result.mentionedServices).toContain('Widget Installation');
  });

  it('extracts a mentioned location from the client context', () => {
    const client = makeTestClient();
    const review = makeReview({ reviewText: "Glad we found a company that serves Coeur d'Alene." });
    const result = analyzeReview(review, client);
    expect(result.mentionedLocations).toContain("Coeur d'Alene");
  });

  it('does not report a service or location that is not mentioned', () => {
    const client = makeTestClient();
    const review = makeReview({ reviewText: 'Fine overall.' });
    const result = analyzeReview(review, client);
    expect(result.mentionedServices).toEqual([]);
    expect(result.mentionedLocations).toEqual([]);
  });

  it('detects an action request', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 2, reviewText: 'Please call me back to sort this out — I want a refund.' });
    const result = analyzeReview(review, client);
    expect(result.concerns.some((c) => /please call/i.test(c))).toBe(true);
    expect(result.concerns.some((c) => /refund/i.test(c))).toBe(true);
  });

  it('detects legal-threat escalation', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 1, reviewText: 'I am contacting a lawyer about this and considering a lawsuit.' });
    const result = analyzeReview(review, client);
    expect(result.escalationNeeded).toBe(true);
    expect(result.concerns.some((c) => /legal threat/i.test(c))).toBe(true);
  });

  it('detects safety-allegation escalation', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 1, reviewText: 'This felt like a serious safety issue and a hazard to my family.' });
    const result = analyzeReview(review, client);
    expect(result.escalationNeeded).toBe(true);
    expect(result.concerns.some((c) => /safety allegation/i.test(c))).toBe(true);
  });

  it('detects injury-claim escalation', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 1, reviewText: 'I was injured on the job site and had to go to the hospital.' });
    const result = analyzeReview(review, client);
    expect(result.escalationNeeded).toBe(true);
    expect(result.concerns.some((c) => /claimed injury/i.test(c))).toBe(true);
  });

  it('detects fraud-allegation escalation', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 1, reviewText: 'This felt like an outright scam, I think I was defrauded.' });
    const result = analyzeReview(review, client);
    expect(result.escalationNeeded).toBe(true);
    expect(result.concerns.some((c) => /fraud allegation/i.test(c))).toBe(true);
  });

  it('detects discrimination-allegation escalation', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 1, reviewText: 'The technician was racist toward my family, it felt like discrimination.' });
    const result = analyzeReview(review, client);
    expect(result.escalationNeeded).toBe(true);
    expect(result.concerns.some((c) => /discrimination allegation/i.test(c))).toBe(true);
  });

  it('detects a direct threat', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 1, reviewText: 'The worker made a threat toward me during the job.' });
    const result = analyzeReview(review, client);
    expect(result.escalationNeeded).toBe(true);
    expect(result.concerns.some((c) => /a threat/i.test(c))).toBe(true);
  });

  it('does not flag escalation for an ordinary negative review', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 2, reviewText: 'Overcharged and the crew was late. Not happy.' });
    const result = analyzeReview(review, client);
    expect(result.escalationNeeded).toBe(false);
  });

  it('flags a review with no useful text without inventing content', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 3, reviewText: 'Ok.' });
    const result = analyzeReview(review, client);
    expect(result.positivePoints).toEqual([]);
    expect(result.negativePoints).toEqual([]);
    expect(result.evidence.some((e) => /too short/i.test(e.description))).toBe(true);
  });

  it('every evidence entry is traceable to review text, client knowledge, or a deterministic rule', () => {
    const client = makeTestClient();
    const review = makeReview({ rating: 5, reviewText: 'Excellent widget installation in Coeur d\'Alene.' });
    const result = analyzeReview(review, client);
    for (const entry of result.evidence) {
      expect(['review_text', 'client_knowledge', 'deterministic_rule']).toContain(entry.type);
    }
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});
