/**
 * Best-effort extraction of a JSON object from a model's raw text response.
 * Models asked to "respond with only JSON" sometimes still wrap it in a
 * markdown code fence or add a stray leading/trailing character — this
 * strips that without attempting anything cleverer. Returns null (never
 * throws) so callers decide how to report the failure — see
 * MalformedModelResponseError in @citadel/shared.
 */
export function extractJson(text: string): unknown | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text)?.trim();
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the outermost {...} span, in case there's leading/trailing prose.
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
