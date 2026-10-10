/** Minimal Workers AI runner. In a Worker pass `(m, i) => env.AI.run(m, i)`; locally use cfRestRunner. */
export type AiRunner = (model: string, input: Record<string, unknown>) => Promise<unknown>;

export function cfRestRunner(accountId: string, apiToken: string, fetchFn: typeof fetch = fetch): AiRunner {
  if (!accountId || !apiToken) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");
  return async (model, input) => {
    // NOTE: never call fetch through an object property (Illegal invocation in Workers).
    const res = await fetchFn(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as { success?: boolean; result?: unknown; errors?: unknown };
    if (!res.ok || body.success === false) throw new Error(`Workers AI ${res.status} ${model}: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
    return body.result;
  };
}

/** Pull the text/JSON payload out of the different response shapes Workers AI models return. */
export function extractAiText(result: unknown): unknown {
  const r = result as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  if (r == null) return r;
  if (typeof r === "string") return r;
  if (r.response !== undefined) return r.response;
  const content = r.choices?.[0]?.message?.content;
  if (content !== undefined) return content;
  return r;
}

export const STORY_MODEL = "@cf/openai/gpt-oss-120b";
export const STORY_MODEL_FALLBACK = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export function isNeuronsExhausted(e: unknown): boolean {
  const msg = (e as Error)?.message ?? String(e);
  return msg.includes("3036") || /neuron/i.test(msg);
}
