/**
 * Shared error types used across the Citadel AI platform. Callers (API routes,
 * CLI, OpenClaw adapter) can pattern-match on `instanceof` to map these to the
 * right response instead of leaking stack traces or guessing.
 */

export class CitadelError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when a requested client does not exist. Never silently substitute another client. */
export class ClientNotFoundError extends CitadelError {
  constructor(identifier: string) {
    super(`Client not found: ${identifier}`, 'CLIENT_NOT_FOUND');
  }
}

/**
 * Thrown when a fact needed to complete a request is not present in the
 * client's stored profile. Agents must raise this instead of inventing the
 * missing fact (phone numbers, prices, services, statistics, etc.).
 */
export class MissingInformationError extends CitadelError {
  constructor(what: string) {
    super(`Required information is missing and was not invented: ${what}`, 'MISSING_INFORMATION');
  }
}

/** Thrown when an external integration (social publishing, GBP, search) has no credentials configured. */
export class NotConfiguredError extends CitadelError {
  constructor(integration: string) {
    super(
      `${integration} is not configured. Provide credentials via environment variables or use the mock adapter for development.`,
      'NOT_CONFIGURED',
    );
  }
}

/** Thrown when an agent or skill has not been implemented yet. Reported explicitly rather than faked. */
export class NotImplementedError extends CitadelError {
  constructor(capability: string) {
    super(`${capability} is not implemented yet.`, 'NOT_IMPLEMENTED');
  }
}

/** Thrown when input to a tool/skill/agent fails schema validation. */
export class ValidationError extends CitadelError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

/** Thrown when content fails Brand QA and cannot proceed automatically. */
export class BrandQaFailedError extends CitadelError {
  public readonly issues: string[];

  constructor(reasons: string[]) {
    super(`Brand QA failed: ${reasons.join('; ')}`, 'BRAND_QA_FAILED');
    this.issues = reasons;
  }
}

/** Thrown when an approval-gated action (e.g. publish) is attempted out of order. */
export class InvalidLifecycleTransitionError extends CitadelError {
  constructor(from: string, to: string) {
    super(`Cannot transition content from ${from} to ${to}`, 'INVALID_LIFECYCLE_TRANSITION');
  }
}
