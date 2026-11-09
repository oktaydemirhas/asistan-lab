import path from "node:path";
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// Small multilingual model (~120 MB quantized), runs locally on CPU: no extra API key, no data leaves the machine.
const MODEL = "Xenova/multilingual-e5-small";
env.cacheDir = path.join(process.cwd(), ".cache", "models");

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function model() {
  extractor ??= pipeline("feature-extraction", MODEL, { dtype: "q8" }) as Promise<FeatureExtractionPipeline>;
  return extractor;
}

/** E5 models expect a role prefix; vectors come back L2-normalized, so cosine similarity is a dot product. */
export async function embed(texts: string[], role: "query" | "passage"): Promise<number[][]> {
  const ex = await model();
  const out = await ex(texts.map((t) => `${role}: ${t}`), { pooling: "mean", normalize: true });
  return out.tolist() as number[][];
}

export const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
