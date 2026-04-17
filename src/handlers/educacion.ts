import { generate } from "../agent/llm";
import { getRecentMessages } from "../db/queries";
import { config } from "../config";
import { log } from "../logger";

export interface EducacionInput {
  sessionId: string;
  userMessage: string;
  program?: string | null;
  email?: string | null;
}

export async function answerEducacion(input: EducacionInput): Promise<{ reply: string; meta: Record<string, unknown> }> {
  const history = await getRecentMessages(input.sessionId, config.CONTEXT_RECENT_TURNS);
  const historyWithoutLast = history.filter(
    (m) => !(m.direction === "in" && m.body === input.userMessage)
  );
  const t0 = Date.now();
  const result = await generate({
    userMessage: input.userMessage,
    program: input.program,
    email: input.email,
    history: historyWithoutLast,
  });
  const elapsed = Date.now() - t0;
  log.info("generate done", {
    ms: elapsed,
    hits: result.kbHits,
    model: result.modelUsed,
    fallback: result.fallbackUsed,
  });
  return {
    reply: result.reply,
    meta: { latency_ms: elapsed, kb_hits: result.kbHits, model: result.modelUsed },
  };
}
