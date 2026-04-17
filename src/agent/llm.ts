import OpenAI from "openai";
import { config, isSandbox } from "../config";
import { log } from "../logger";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";
import { formatChunks, searchKB } from "./rag";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: config.OPENAI_API_KEY! });
  return _client;
}

export interface GenerateOpts {
  userMessage: string;
  program?: string | null;
  email?: string | null;
  history?: Array<{ direction: "in" | "out"; body: string }>;
}

export interface GenerateResult {
  reply: string;
  kbHits: number;
  modelUsed: string;
  fallbackUsed: boolean;
}

const SANDBOX_REPLY =
  "(sandbox mode: aqui ATLAS responderia con informacion del KB. Configura OPENAI_API_KEY y ATLAS_VECTOR_STORE_ID para activar.)\n\nEquipo de Educacion SaleAds";

async function callModel(model: string, systemText: string, userText: string): Promise<string> {
  const resp = await client().chat.completions.create({
    model,
    temperature: 0.5,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: userText },
    ],
  });
  const out = resp.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("respuesta vacia del LLM");
  return out;
}

export async function generate(opts: GenerateOpts): Promise<GenerateResult> {
  if (isSandbox()) {
    return {
      reply: SANDBOX_REPLY,
      kbHits: 0,
      modelUsed: "sandbox",
      fallbackUsed: false,
    };
  }

  const chunks = await searchKB(opts.userMessage);
  const kbContext = formatChunks(chunks);
  const userText = buildUserPrompt({ ...opts, kbContext });

  const primary = config.OPENAI_CHAT_MODEL;
  const fallback = config.ATLAS_FALLBACK_MODEL;

  try {
    const reply = await callModel(primary, SYSTEM_PROMPT, userText);
    return { reply, kbHits: chunks.length, modelUsed: primary, fallbackUsed: false };
  } catch (e) {
    log.warn("primary model fallo, intento fallback", {
      primary,
      fallback,
      error: String(e).slice(0, 300),
    });
    try {
      const reply = await callModel(fallback, SYSTEM_PROMPT, userText);
      return { reply, kbHits: chunks.length, modelUsed: fallback, fallbackUsed: true };
    } catch (e2) {
      log.error("ambos modelos fallaron", { error: String(e2).slice(0, 300) });
      return {
        reply:
          "Tuvimos un problema tecnico procesando tu mensaje. Lo escalamos para que alguien te responda manualmente.\n\nEquipo de Educacion SaleAds",
        kbHits: chunks.length,
        modelUsed: "none",
        fallbackUsed: true,
      };
    }
  }
}
