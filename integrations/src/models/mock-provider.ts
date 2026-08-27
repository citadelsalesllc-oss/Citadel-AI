import type { GenerateParams, GenerateResult, ModelProvider, ModelProviderCapabilities } from '@citadel/shared';

function extractField(text: string, label: string): string | undefined {
  const match = new RegExp(`^${label}:\\s*(.+)$`, 'm').exec(text);
  return match?.[1]?.trim();
}

function extractBlock(text: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`).exec(text);
  return match?.[1]?.trim();
}

/** zod-to-json-schema always emits `{ $ref: "#/definitions/<name>", ... }` — the name is how the mock tells which structured contract is being requested (see the two branches in generate() below). */
function schemaName(responseSchema: Record<string, unknown> | undefined): string | undefined {
  const ref = responseSchema?.$ref;
  return typeof ref === 'string' ? ref.split('/').pop() : undefined;
}

interface EvidenceCatalogEntry {
  id: string;
  type: string;
  description: string;
}

/** Parses the `[id] (type) description` lines the SEO prompt's evidence catalog block emits — see prompts/src/seo/v1.ts's buildEvidenceCatalogBlock. */
function extractEvidenceCatalog(text: string): EvidenceCatalogEntry[] {
  const block = extractBlock(text, 'evidence_catalog');
  if (!block) return [];
  const entries: EvidenceCatalogEntry[] = [];
  for (const line of block.split('\n')) {
    const match = /^\[([^\]]+)]\s*\(([^)]+)\)\s*(.+)$/.exec(line.trim());
    if (match?.[1] && match[2] && match[3]) {
      entries.push({ id: match[1], type: match[2], description: match[3] });
    }
  }
  return entries;
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
 * shaped like whichever contract was actually requested — the mock
 * dispatches on the JSON Schema's name (see `schemaName()` above) rather
 * than being a generic JSON Schema instance generator (which would be
 * considerably more machinery for no current benefit — see the
 * effort-scoping notes in ARCHITECTURE.md). Two structured-generation
 * callers exist today: the Content Agent (`content_generation_result`)
 * and the SEO Agent (`seo_interpretation_result`).
 */
export class MockModelProvider implements ModelProvider {
  readonly name = 'mock';
  readonly capabilities: ModelProviderCapabilities = { structuredOutput: true, toolCalling: false };

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const userMessage = params.messages[params.messages.length - 1]?.content ?? '';
    const name = schemaName(params.responseSchema);

    if (params.responseSchema && name === 'seo_interpretation_result') {
      return this.generateSeoInterpretation(params, userMessage);
    }

    return this.generateContent(params, userMessage);
  }

  private async generateSeoInterpretation(params: GenerateParams, userMessage: string): Promise<GenerateResult> {
    const company = extractField(userMessage, 'Company') ?? 'the business';
    const evidence = extractEvidenceCatalog(userMessage);
    const keywordsField = extractField(userMessage, 'Primary SEO keywords on file');
    const keywordOpportunities = keywordsField
      ? keywordsField.split(';').map((k) => k.trim()).filter(Boolean)
      : [];

    // Deterministic stand-in for "prioritize and explain the top findings":
    // take the first few catalog entries and cite each one's real id, never
    // a fabricated one — the same evidence-grounding rule a real model call
    // is asked to follow (see prompts/src/seo/v1.ts SAFETY_REQUIREMENTS).
    const recommendations = evidence.slice(0, 3).map((entry) => ({
      title: entry.description.length > 60 ? `${entry.description.slice(0, 57)}...` : entry.description,
      description: `Audit finding: ${entry.description}`,
      priority: 'medium' as const,
      evidence_refs: [entry.id],
    }));

    const structured = {
      keyword_opportunities: keywordOpportunities,
      recommendations,
      summary: `Mock SEO audit summary for ${company}: ${evidence.length} finding(s) reviewed.`,
    };
    const text = JSON.stringify(structured);

    return {
      text,
      structured,
      model: 'mock-deterministic-v1',
      provider: this.name,
      stopReason: 'end_turn',
      usage: {
        inputTokens: Math.ceil((params.system.length + userMessage.length) / 4),
        outputTokens: Math.ceil(text.length / 4),
      },
    };
  }

  private async generateContent(params: GenerateParams, userMessage: string): Promise<GenerateResult> {
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
