import nodemailer from "nodemailer";
import { config } from "../config";
import { log } from "../logger";

let _transport: nodemailer.Transporter | null = null;
function transport(): nodemailer.Transporter | null {
  if (_transport) return _transport;
  if (!config.SMTP_USER || !config.SMTP_PASS) {
    log.warn("SMTP no configurado; emails deshabilitados");
    return null;
  }
  _transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
  return _transport;
}

export interface EscalationPayload {
  subject: string;
  summary: string;
  userMeta: {
    waId: string;
    profileName?: string | null;
    program?: string | null;
    email?: string | null;
  };
  lastMessages: Array<{ direction: "in" | "out"; body: string; created_at: Date }>;
  classificationTags: string[];
  reason: string;
}

function renderBody(p: EscalationPayload): string {
  const lines: string[] = [];
  lines.push(`📋 ATLAS — Escalamiento a humano`);
  lines.push(``);
  lines.push(`Motivo: ${p.reason}`);
  if (p.classificationTags.length) {
    lines.push(`Tags: ${p.classificationTags.join(", ")}`);
  }
  lines.push(``);
  lines.push(`--- DATOS DEL USUARIO ---`);
  lines.push(`WhatsApp: +${p.userMeta.waId}`);
  if (p.userMeta.profileName) lines.push(`Nombre: ${p.userMeta.profileName}`);
  if (p.userMeta.program) lines.push(`Programa: ${p.userMeta.program}`);
  if (p.userMeta.email) lines.push(`Correo: ${p.userMeta.email}`);
  lines.push(``);
  lines.push(`--- RESUMEN ---`);
  lines.push(p.summary);
  lines.push(``);
  lines.push(`--- ULTIMOS MENSAJES ---`);
  for (const m of p.lastMessages) {
    const who = m.direction === "in" ? "Usuario" : "ATLAS";
    lines.push(`[${m.created_at.toISOString()}] ${who}: ${m.body}`);
  }
  lines.push(``);
  lines.push(`-- Enviado automaticamente por ATLAS`);
  return lines.join("\n");
}

export async function sendEscalationEmail(p: EscalationPayload): Promise<boolean> {
  const t = transport();
  if (!t) {
    log.warn("SMTP no configurado, escalamiento no enviado", { wa: p.userMeta.waId });
    return false;
  }
  try {
    await t.sendMail({
      from: config.ESCALATION_EMAIL_FROM,
      to: config.ESCALATION_EMAIL_TO,
      subject: p.subject,
      text: renderBody(p),
    });
    log.info("escalamiento enviado por email", {
      wa: p.userMeta.waId,
      to: config.ESCALATION_EMAIL_TO,
    });
    return true;
  } catch (e) {
    log.error("fallo enviar email", { error: String(e).slice(0, 300) });
    return false;
  }
}
