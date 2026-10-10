/** Minimal Workers AI runner type (REST locally, binding in the Worker). */
export type AiRunner = (model: string, input: unknown) => Promise<unknown>;

export const STORY_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const STORY_MODEL_FALLBACK = "@cf/openai/gpt-oss-120b";

export function isNeuronsExhausted(e: unknown): boolean {
  const msg = (e as Error)?.message ?? String(e);
  return msg.includes("3036") || /neuron/i.test(msg);
}
