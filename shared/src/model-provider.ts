/**
 * Provider-agnostic model interface. Agents and skills depend only on this
 * interface, never on a specific vendor SDK — swapping the underlying model
 * provider (Anthropic today, others later) never touches business logic.
 * See integrations/models for concrete implementations.
 */

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateParams {
  /** System prompt establishing the agent's role, constraints, and brand context. */
  system: string;
  messages: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  provider: string;
  stopReason: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ModelProvider {
  readonly name: string;
  generate(params: GenerateParams): Promise<GenerateResult>;
}
