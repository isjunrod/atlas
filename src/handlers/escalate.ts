import type { Intent } from "../router/classifier";
import { getRecentMessages, markEscalationEmailSent, recordEscalation, updateSession } from "../db/queries";
import { sendEscalationEmail } from "../notify/email";

interface EscalateParams {
  sessionId: string;
  profileName?: string | null;
  program?: string | null;
  email?: string | null;
  intent: Intent;
  tags: string[];
  lastUserMessage: string;
}

const SUBJECT_BY_INTENT: Record<Intent, string> = {
  legal_urgent: "[ATLAS][URGENTE][LEGAL] Usuario con amenaza legal",
  refund_billing: "[ATLAS][URGENTE] Reembolso / cobro / cancelacion",
  saleads_technical: "[ATLAS] Usuario agota flujo de soporte tecnico",
  switch_program: "[ATLAS] Cambio de programa (no deberia escalar)",
  close_session: "[ATLAS] Cierre de conversacion (no deberia escalar)",
  education: "[ATLAS] Caso educativo que requiere humano",
  unknown: "[ATLAS] Caso sin clasificar",
};

const REPLY_BY_INTENT: Record<Intent, string> = {
  legal_urgent:
    "Recibimos tu correo y entendemos la seriedad de tu caso. Desde el area de educacion no gestionamos devoluciones ni temas legales, pero vamos a escalar tu caso internamente con caracter de urgencia para que el equipo responsable lo atienda a la brevedad. Si no recibes respuesta en las proximas 48 horas, escribenos de vuelta y hacemos seguimiento.\n\nEquipo de Educacion SaleAds",
  refund_billing:
    "Entendemos tu situacion y lamentamos la experiencia. Ya escalamos tu caso internamente para que le den prioridad. Mientras tanto, te recomendamos formalizar tu solicitud enviando un correo a support@saleads.ai con tu nombre completo, correo de compra, fecha y motivo.\n\nEquipo de Educacion SaleAds",
  saleads_technical:
    "Gracias por escribirnos. Esta linea es exclusiva para temas de educacion, pero como ya no tuviste respuesta por soporte, escalamos tu caso internamente para que te agenden una sesion directa. Nos confirmas tu nombre completo, correo de compra y disponibilidad (9 AM, 1 PM o 6 PM hora Colombia).\n\nEquipo de Educacion SaleAds",
  switch_program:
    "Aqui tienes las opciones. Elige el programa desde el menu que acabamos de enviarte.\n\nEquipo de Educacion SaleAds",
  close_session:
    "Un gusto, estamos aqui cuando nos necesites.\n\nEquipo de Educacion SaleAds",
  education:
    "Estamos revisando tu caso con el equipo para darte la mejor respuesta. Volvemos contigo en breve.\n\nEquipo de Educacion SaleAds",
  unknown:
    "Estamos revisando tu caso con el equipo. Volvemos contigo en breve.\n\nEquipo de Educacion SaleAds",
};

export async function escalateToHuman(params: EscalateParams): Promise<{ reply: string }> {
  const history = await getRecentMessages(params.sessionId, 20);
  const summaryLines = [
    `Ultimo mensaje del usuario: "${params.lastUserMessage.slice(0, 400)}"`,
    `Intent: ${params.intent}`,
    `Tags: ${params.tags.join(", ") || "-"}`,
  ];
  const escalationId = await recordEscalation(
    params.sessionId,
    params.intent,
    summaryLines.join("\n")
  );
  const sent = await sendEscalationEmail({
    subject: SUBJECT_BY_INTENT[params.intent],
    summary: summaryLines.join("\n"),
    userMeta: {
      waId: params.sessionId,
      profileName: params.profileName,
      program: params.program,
      email: params.email,
    },
    lastMessages: history,
    classificationTags: params.tags,
    reason: params.intent,
  });
  if (sent) {
    await markEscalationEmailSent(escalationId);
  }
  await updateSession(params.sessionId, { escalated: true });
  return { reply: REPLY_BY_INTENT[params.intent] };
}
