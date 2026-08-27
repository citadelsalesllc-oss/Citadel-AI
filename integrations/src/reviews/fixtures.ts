import type { ExternalReviewData } from './types.js';

/**
 * ============================================================================
 * TEST / DEVELOPMENT DATA — NOT REAL CUSTOMER REVIEWS.
 * ============================================================================
 * Fabricated fixture reviews for the CDA Septic Systems demo client, used
 * only by MockReviewProvider (local dev + automated tests — see Phase 5
 * master spec section 12). No real person's name or personal information
 * appears here; reviewer identifiers are anonymized initials only. These
 * reviews must never be presented to a user or client as genuine feedback.
 *
 * Covers every category the spec requires: 5-star positive, 4-star
 * positive, 3-star mixed, 2-star negative, 1-star serious complaint
 * (escalation-worthy), a review mentioning a service, one mentioning a
 * location, and one with no useful text.
 */
export const CDA_SEPTIC_SYSTEMS_MOCK_REVIEWS: ExternalReviewData[] = [
  {
    externalId: 'mock-review-1',
    reviewerName: 'J.T.',
    rating: 5,
    reviewText:
      "Fantastic experience! The crew was professional, on time, and finished our septic tank installation ahead of schedule. Highly recommend to anyone in Coeur d'Alene needing septic work done right.",
    reviewDate: new Date('2026-06-02T15:00:00Z'),
  },
  {
    externalId: 'mock-review-2',
    reviewerName: 'M.R.',
    rating: 4,
    reviewText:
      'Good service overall. Pumped our tank quickly and the technician was friendly. Only reason for 4 stars instead of 5 is the appointment window was a bit long.',
    reviewDate: new Date('2026-06-10T18:30:00Z'),
  },
  {
    externalId: 'mock-review-3',
    reviewerName: null,
    rating: 3,
    reviewText:
      'Job got done but communication could have been better. They showed up a day later than originally scheduled without much notice, though the actual work on the septic system was fine once they arrived.',
    reviewDate: new Date('2026-06-18T12:00:00Z'),
  },
  {
    externalId: 'mock-review-4',
    reviewerName: 'D.K.',
    rating: 2,
    reviewText:
      "Disappointed with the pricing — ended up costing more than the estimate with little explanation. The pumping itself seemed fine but I felt overcharged and won't be using them again.",
    reviewDate: new Date('2026-06-25T09:15:00Z'),
  },
  {
    externalId: 'mock-review-5',
    reviewerName: 'Anonymous',
    rating: 1,
    reviewText:
      "The truck backed into our fence and damaged our yard during the installation, and nobody has called us back about repairing it. Considering contacting a lawyer if this isn't resolved soon.",
    reviewDate: new Date('2026-07-01T14:45:00Z'),
  },
  {
    externalId: 'mock-review-6',
    reviewerName: 'S.P.',
    rating: 5,
    reviewText: 'Called for emergency septic pumping over the weekend and they came out same day. Great service, would use again.',
    reviewDate: new Date('2026-07-08T20:00:00Z'),
  },
  {
    externalId: 'mock-review-7',
    reviewerName: 'L.W.',
    rating: 4,
    reviewText: "We're out near Hayden and were glad to find a company that services our area. Installation went smoothly.",
    reviewDate: new Date('2026-07-15T11:30:00Z'),
  },
  {
    externalId: 'mock-review-8',
    reviewerName: null,
    rating: 3,
    reviewText: 'Ok.',
    reviewDate: new Date('2026-07-20T08:00:00Z'),
  },
];
