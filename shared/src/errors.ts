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
 * Thrown when a client-scoped record (service, offer, FAQ, etc.) either
 * doesn't exist or doesn't belong to the client it was requested under.
 * Deliberately the SAME error for both cases — a caller must never be able
 * to distinguish "wrong id" from "that record belongs to another client"
 * (that distinction itself would leak cross-tenant information). This is
 * the tenant-isolation enforcement point: every repository method that
 * looks up a child record by id re-checks clientId and throws this instead
 * of returning another tenant's row.
 */
export class ResourceNotFoundError extends CitadelError {
  constructor(resourceType: string, id: string) {
    super(`${resourceType} not found: ${id}`, 'RESOURCE_NOT_FOUND');
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

/** Thrown when a create would violate a uniqueness constraint (e.g. a client slug already in use). */
export class DuplicateRecordError extends CitadelError {
  constructor(resourceType: string, field: string, value: string) {
    super(`${resourceType} with ${field} "${value}" already exists`, 'DUPLICATE_RECORD');
  }
}

/** Thrown when input to a tool/skill/agent fails schema validation. */
export class ValidationError extends CitadelError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

/** Thrown when an approval-gated action (e.g. publish) is attempted out of order. */
export class InvalidLifecycleTransitionError extends CitadelError {
  constructor(from: string, to: string) {
    super(`Cannot transition content from ${from} to ${to}`, 'INVALID_LIFECYCLE_TRANSITION');
  }
}

/**
 * Thrown when a client exists but is not in a usable state for AI
 * generation (e.g. ARCHIVED). Distinct from ClientNotFoundError: the
 * client was identified, but the Orchestrator's validation step (Phase 3
 * spec step 3, "validate the client") refused to proceed with it.
 */
export class ClientNotActiveError extends CitadelError {
  constructor(identifier: string, status: string) {
    super(`Client "${identifier}" is ${status} and cannot be used for generation`, 'CLIENT_NOT_ACTIVE');
  }
}

/**
 * Thrown when the model provider itself fails — network error, API error,
 * timeout, or any other failure from the underlying SDK/HTTP call. Always
 * thrown, never smuggled into a success-shaped result — see
 * ModelProvider's doc comment in model-provider.ts.
 */
export class ModelProviderError extends CitadelError {
  constructor(provider: string, cause: string) {
    super(`${provider} model provider failed: ${cause}`, 'MODEL_PROVIDER_ERROR');
  }
}

/**
 * Thrown when a provider was asked for structured output (`responseSchema`)
 * and its response could not be parsed as JSON or didn't match the
 * requested shape. The caller must never fall back to treating the raw
 * text as if it had validated.
 */
export class MalformedModelResponseError extends CitadelError {
  constructor(provider: string, detail: string) {
    super(`${provider} returned a response that did not match the requested structure: ${detail}`, 'MALFORMED_MODEL_RESPONSE');
  }
}

/**
 * Thrown before any fetch attempt when a supplied URL is malformed or uses
 * a non-HTTP(S) scheme. Distinct from the network-level failures below —
 * this is a request-input problem, not an upstream one.
 */
export class InvalidUrlError extends CitadelError {
  constructor(url: string, reason: string) {
    super(`"${url}" is not a fetchable URL: ${reason}`, 'INVALID_URL');
  }
}

/**
 * Thrown when a website fetch could not complete because of a network/DNS
 * failure (connection refused, name not resolved, TLS failure, etc.) — as
 * opposed to the target site responding with an HTTP error status, which is
 * itself a valid (and reportable) SEO finding, not a fetch failure. Never
 * caught and turned into a fabricated "page could not be analyzed" result —
 * the audit must fail honestly instead.
 */
export class WebsiteUnreachableError extends CitadelError {
  constructor(url: string, cause: string) {
    super(`Could not reach ${url}: ${cause}`, 'WEBSITE_UNREACHABLE');
  }
}

/** Thrown when a website fetch exceeds the configured timeout. */
export class WebsiteFetchTimeoutError extends CitadelError {
  constructor(url: string, timeoutMs: number) {
    super(`Fetching ${url} timed out after ${timeoutMs}ms`, 'WEBSITE_FETCH_TIMEOUT');
  }
}

/**
 * Thrown when a fetched resource's Content-Type isn't HTML (a PDF, image,
 * API response, etc.) and so cannot be analyzed by the SEO checks, which
 * all assume parsed markup. Reported honestly rather than running HTML
 * checks against non-HTML bytes and fabricating findings.
 */
export class UnsupportedContentTypeError extends CitadelError {
  constructor(url: string, contentType: string) {
    super(`${url} returned an unsupported content type for SEO analysis: ${contentType}`, 'UNSUPPORTED_CONTENT_TYPE');
  }
}

/** Thrown when a fetched page's body exceeds the configured size limit, to bound memory/time on pathological or non-HTML responses. */
export class WebsiteContentTooLargeError extends CitadelError {
  constructor(url: string, limitBytes: number) {
    super(`${url}'s response exceeded the ${limitBytes}-byte analysis limit`, 'WEBSITE_CONTENT_TOO_LARGE');
  }
}
