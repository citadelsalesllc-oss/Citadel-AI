import type { GenerateParams, GenerateResult, ModelProvider } from '@citadel/shared';

function extractField(text: string, label: string): string | undefined {
  const match = new RegExp(`^${label}:\\s*(.+)$`, 'm').exec(text);
  return match?.[1]?.trim();
}

/**
 * Deterministic, dependency-free ModelProvider used for local development
 * (when ANTHROPIC_API_KEY is not set) and automated tests. It does not call
 * any external service and produces the same output for the same input,
 * which is what makes the test suite reliable without network access or an
 * API key. It performs lightweight template extraction against the
 * structured prompt format the Content Agent builds (see
 * agents/src/content/prompt.ts) rather than attempting real generation.
 */
export class MockModelProvider implements ModelProvider {
  readonly name = 'mock';

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const userMessage = params.messages[params.messages.length - 1]?.content ?? '';

    const instruction = extractField(userMessage, 'Instruction') ?? 'Share an update.';
    const company = extractField(userMessage, 'Company') ?? 'the business';
    const serviceArea = extractField(userMessage, 'Service area');
    const phone = extractField(userMessage, 'Phone');
    const preferredPhrases = extractField(userMessage, 'Preferred phrases');
    const services = extractField(userMessage, 'Services');
    const offers = extractField(userMessage, 'Offers');

    const firstPreferredPhrase = preferredPhrases?.split(';').map((p) => p.trim())[0];
    const firstService = services?.split(';').map((s) => s.trim())[0]?.split(' - ')[0];

    const sentences: string[] = [];
    sentences.push(`${instruction.replace(/\.$/, '')} — here's the latest from ${company}.`);
    if (firstService) {
      sentences.push(`Our team just completed another ${firstService.toLowerCase()} for a local customer.`);
    }
    if (serviceArea) {
      sentences.push(`${company} is ${firstPreferredPhrase ?? 'proud to serve'} ${serviceArea}.`);
    }
    if (offers) {
      sentences.push(`Right now: ${offers.split(';')[0]?.trim()}.`);
    }
    if (phone) {
      sentences.push(`Call ${phone} to get started.`);
    }

    const text = sentences.join(' ');

    return {
      text,
      model: 'mock-deterministic-v1',
      provider: this.name,
      stopReason: 'end_turn',
      usage: {
        inputTokens: Math.ceil((params.system.length + userMessage.length) / 4),
        outputTokens: Math.ceil(text.length / 4),
      },
    };
  }
}
