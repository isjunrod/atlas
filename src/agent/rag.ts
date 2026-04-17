import OpenAI from "openai";
import { config, isSandbox } from "../config";
import { log } from "../logger";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: config.OPENAI_API_KEY! });
  return _client;
}

export interface RetrievedChunk {
  score: number;
  text: string;
  filename?: string;
}

export async function searchKB(query: string, topK = 5): Promise<RetrievedChunk[]> {
  if (isSandbox() || !config.ATLAS_VECTOR_STORE_ID) {
    log.warn("searchKB sandbox: no vector store");
    return [];
  }
  try {
    const r = await client().vectorStores.search(config.ATLAS_VECTOR_STORE_ID, {
      query,
      max_num_results: topK,
    });
    const chunks: RetrievedChunk[] = [];
    for (const item of r.data ?? []) {
      const parts = (item.content ?? [])
        .map((c) => (c as { text?: string }).text ?? "")
        .filter(Boolean);
      const text = parts.join("\n").trim();
      if (text) {
        chunks.push({
          score: item.score ?? 0,
          text,
          filename: item.filename,
        });
      }
    }
    return chunks;
  } catch (e) {
    log.error("searchKB fallo", { error: String(e).slice(0, 300) });
    return [];
  }
}

export function formatChunks(chunks: RetrievedChunk[]): string {
  if (!chunks.length) {
    return "(No se encontraron fragmentos relevantes en el KB. Responde diciendo que consultaremos y regresamos, o pregunta para aclarar.)";
  }
  return chunks
    .map((c, i) => `[Fragmento ${i + 1} | relevancia ${c.score.toFixed(2)}]\n${c.text}`)
    .join("\n\n---\n\n");
}
