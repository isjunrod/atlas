import { getOrCreateSession, insertMessage, markWebhookProcessed } from "../db/queries";
import { runIntake } from "../intake/flow";
import { classifyIntent } from "../router/classifier";
import { answerEducacion } from "../handlers/educacion";
import { escalateToHuman } from "../handlers/escalate";
import { refundSoftRedirectReply, saleadsRedirectReply } from "../handlers/saleads_redirect";
import { sendWhatsapp } from "../wa/client";
import { parseInbound, type MetaWebhookBody } from "../wa/types";
import { log } from "../logger";

const GREET_RE = /^(hola|holi|buen[oa]s|saludos|hello|hi)\b/i;
const THANKS_RE = /^(gracias|muchas gracias|mil gracias|thanks)\b/i;

function fastPath(text: string): string | null {
  const t = text.trim();
  if (t.length > 40) return null;
  if (GREET_RE.test(t)) {
    return (
      "¡Hola! Somos el Equipo de Educacion SaleAds. Cuentanos tu duda y te ayudamos."
    );
  }
  if (THANKS_RE.test(t)) {
    return "¡Para eso estamos! Cualquier otra duda, escribenos.\n\nEquipo de Educacion SaleAds";
  }
  return null;
}

export async function handleWebhookPayload(payload: MetaWebhookBody) {
  const inbounds = parseInbound(payload);
  if (!inbounds.length) {
    log.debug("webhook sin mensajes parseados");
    return;
  }
  for (const msg of inbounds) {
    await processInbound(msg).catch((e) => {
      log.error("processInbound fallo", { error: String(e).slice(0, 300), wamid: msg.wamid });
    });
  }
}

async function processInbound(msg: {
  wamid: string;
  waId: string;
  profileName: string | null;
  text: string;
  type: string;
}) {
  const fresh = await markWebhookProcessed(msg.wamid);
  if (!fresh) {
    log.info("duplicate wamid ignorado", { wamid: msg.wamid });
    return;
  }
  if (msg.type !== "text" || !msg.text) {
    log.info("tipo no soportado aun, ignorado", { type: msg.type, waId: msg.waId });
    return;
  }

  const session = await getOrCreateSession(msg.waId);
  await insertMessage(session.id, "in", msg.text, { wamid: msg.wamid });

  // si ya esta escalado, no seguir respondiendo con IA
  if (session.escalated) {
    log.info("sesion ya escalada, no re-respondemos auto", { waId: session.id });
    return;
  }

  // fast-path saludos/gracias
  const canned = fastPath(msg.text);
  if (canned) {
    await deliver(session.id, msg.waId, canned);
    return;
  }

  // intake hibrido
  const intake = await runIntake(session, msg.text);
  if (intake.reply) {
    await deliver(session.id, msg.waId, intake.reply);
    return;
  }
  if (!intake.continueToAgent) return;

  // refresh session para tener los updates del intake
  const current = await getOrCreateSession(msg.waId);

  // clasificador
  const cls = classifyIntent(msg.text);
  log.info("clasificador", { waId: session.id, intent: cls.intent, tags: cls.tags });

  if (cls.intent === "legal_urgent" || cls.intent === "refund_billing") {
    const { reply } = await escalateToHuman({
      sessionId: session.id,
      profileName: msg.profileName,
      program: current.program,
      email: current.email,
      intent: cls.intent,
      tags: cls.tags,
      lastUserMessage: msg.text,
    });
    // para refund_billing usamos una redireccion suave en vez del escalate reply genérico cuando queremos pedir datos
    const finalReply = cls.intent === "refund_billing" ? reply : reply;
    await deliver(session.id, msg.waId, finalReply);
    return;
  }

  if (cls.intent === "saleads_technical") {
    await deliver(session.id, msg.waId, saleadsRedirectReply());
    return;
  }

  // education default: usar RAG + LLM
  try {
    const out = await answerEducacion({
      sessionId: session.id,
      userMessage: msg.text,
      program: current.program,
      email: current.email,
    });
    await deliver(session.id, msg.waId, out.reply);
  } catch (e) {
    log.error("answerEducacion fallo, escalando", { error: String(e).slice(0, 300) });
    const { reply } = await escalateToHuman({
      sessionId: session.id,
      profileName: msg.profileName,
      program: current.program,
      email: current.email,
      intent: "unknown",
      tags: ["llm_error"],
      lastUserMessage: msg.text,
    });
    await deliver(session.id, msg.waId, reply);
  }
}

async function deliver(sessionId: string, waId: string, body: string) {
  const { wamids } = await sendWhatsapp(waId, body);
  await insertMessage(sessionId, "out", body, {
    wamid: wamids[0],
    meta: { parts: wamids.length },
  });
}

export const __forTests = { fastPath };
