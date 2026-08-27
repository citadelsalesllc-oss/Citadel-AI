import type { GenerateParams, GenerateResult, ModelProvider, ModelProviderCapabilities } from '@citadel/shared';

function extractField(text: string, label: string): string | undefined {
  const match = new RegExp(`^${label}:\\s*(.+)$`, 'm').exec(text);
  return match?.[1]?.trim();
}

function extractBlock(text: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`).exec(text);
  return match?.[1]?.trim();
}

/**
 * Deterministic, dependency-free ModelProvider used for local development
 * (when ANTHROPIC_API_KEY is not set) and automated tests. It does not call
 * any external service and produces the same output for the same input,
 * which is what makes the test suite reliable without network access or an
 * API key. It performs lightweight template extraction against the
 * structured prompt format the Content Agent builds (see
 * prompts/src/content/v1.ts) rather than attempting real generation.
 *
 * When `responseSchema` is requested it returns a structured object
 * shaped like the content-generation contract — this is the only
 * structured-generation caller in the codebase today, so the mock is
 * pragmatically tailored to that shape rather than being a generic JSON
 * Schema instance generator (which would be considerably more machinery
 * for no current benefit — see the effort-scoping notes in ARCHITECTURE.md).
 */
export class MockModelProvider implements ModelProvider {
  readonly name = 'mock';
  readonly capabilities: ModelProviderCapabilities = { structuredOutput: true, toolCalling: false };

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const userMessage = params.messages[params.messages.length - 1]?.content ?? '';

    const platform = extractField(userMessage, 'Platform') ?? 'FACEBOOK';
    const topic = extractBlock(userMessage, 'topic') ?? 'a recent update';
    const company = extractField(userMessage, 'Company') ?? 'the business';
    const serviceArea = extractField(userMessage, 'Service area');
    const phone = extractField(userMessage, 'Phone');
    const services = extractField(userMessage, 'Services');
    const offers = extractField(userMessage, 'Offers');
    const seoKeywords = extractField(userMessage, 'SEO keywords');

    const firstService = services?.split(';').map((s) => s.trim())[0]?.split(' - ')[0];

    const sentences: string[] = [`${topic.replace(/\.$/, '')} — here's the latest from ${company}.`];
    if (firstService) {
      sentences.push(`Our team just completed another ${firstService.toLowerCase()} for a local customer.`);
    }
    if (serviceArea) {
      sentences.push(`${company} proudly serves ${serviceArea}.`);
    }
    if (offers) {
      sentences.push(`Right now: ${offers.split(';')[0]?.trim()}.`);
    }

    const content = sentences.join(' ');
    const cta = phone ? `Call ${phone} to get started.` : null;
    const seoKeywordsUsed = seoKeywords
      ? seoKeywords
          .split(';')
          .map((k) => k.trim())
          .filter((k) => content.toLowerCase().includes(k.toLowerCase()))
      : [];

    const structured = {
      platform,
      content,
      hashtags: [] as string[],
      cta,
      seo_keywords_used: seoKeywordsUsed,
      notes: [] as string[],
    };

    const text = params.responseSchema ? JSON.stringify(structured) : content;

    const result: GenerateResult = {
      text,
      model: 'mock-deterministic-v1',
      provider: this.name,
      stopReason: 'end_turn',
      usage: {
        inputTokens: Math.ceil((params.system.length + userMessage.length) / 4),
        outputTokens: Math.ceil(text.length / 4),
      },
    };

    if (params.responseSchema) {
      result.structured = structured;
    }

    return result;
  }
}
