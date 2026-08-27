/**
 * Provider-agnostic model interface. Agents and skills depend only on this
 * interface, never on a specific vendor SDK — swapping the underlying model
 * provider (Anthropic today, others later) never touches business logic.
 * See integrations/models for concrete implementations.
 *
 * Structured generation and tool/function calling are both part of the
 * contract (per the Phase 3 spec) but tool calling is intentionally
 * unimplemented by either current provider — see `capabilities` below and
 * ARCHITECTURE.md "Model provider abstraction." Declaring the shape now
 * means a future provider (or a future agent that needs it) has a stable
 * contract to implement/consume without another interface change.
 */

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A callable the model may invoke mid-generation. Not used by any agent yet — see ARCHITECTURE.md. */
export interface ModelToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
}

export interface ModelToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface GenerateParams {
  /** System prompt establishing the agent's role, constraints, and brand context. */
  system: string;
  messages: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
  /**
   * When set, the provider must return output conforming to this JSON
   * Schema in `GenerateResult.structured`, or throw
   * MalformedModelResponseError — never silently fall back to freeform
   * text while claiming structured output succeeded.
   */
  responseSchema?: Record<string, unknown>;
  /** Tools the model may call. See ModelToolDefinition — no current provider implements this yet. */
  tools?: ModelToolDefinition[];
}

export interface GenerateResult {
  text: string;
  /** Present only when `responseSchema` was provided and validated successfully. */
  structured?: unknown;
  /** Present only when the model actually invoked a provided tool. Empty array if none were called. */
  toolCalls?: ModelToolCall[];
  model: string;
  provider: string;
  stopReason: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** What a given provider implementation actually supports, so callers can degrade gracefully instead of assuming. */
export interface ModelProviderCapabilities {
  structuredOutput: boolean;
  toolCalling: boolean;
}

export interface ModelProvider {
  readonly name: string;
  readonly capabilities: ModelProviderCapabilities;
  /**
   * Errors are always thrown (ModelProviderError / MalformedModelResponseError
   * from shared/src/errors.ts), never returned as a field on a
   * success-shaped result — callers use normal try/catch, consistent with
   * every other failure mode in this codebase.
   */
  generate(params: GenerateParams): Promise<GenerateResult>;
}
