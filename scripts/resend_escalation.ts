/**
 * Reenvia por email un escalamiento ya registrado en la DB.
 * Uso: bun run scripts/resend_escalation.ts <escalation_id>
 */

import { sql } from "../src/db/client";
import { sendEscalationEmail } from "../src/notify/email";
import { markEscalationEmailSent } from "../src/db/queries";
import { log } from "../src/logger";

async function main() {
  const idRaw = process.argv[2];
  if (!idRaw) {
    console.error("Uso: bun run scripts/resend_escalation.ts <id>");
    process.exit(1);
  }
  const id = Number(idRaw);

  const db = sql();
  const rows = await db<
    Array<{
      id: number;
      session_id: string;
      reason: string;
      summary: string;
    }>
  >`SELECT id, session_id, reason, summary FROM escalations WHERE id = ${id}`;
  const esc = rows[0];
  if (!esc) {
    console.error(`escalation id=${id} no existe`);
    process.exit(1);
  }

  const sessionRows = await db<
    Array<{ id: string; program: string | null; email: string | null; meta: Record<string, unknown> }>
  >`SELECT id, program, email, meta FROM sessions WHERE id = ${esc.session_id}`;
  const session = sessionRows[0]!;

  const messages = await db<
    Array<{ direction: "in" | "out"; body: string; created_at: Date }>
  >`SELECT direction, body, created_at FROM messages WHERE session_id = ${esc.session_id} ORDER BY created_at DESC LIMIT 20`;

  const subjectByIntent: Record<string, string> = {
    legal_urgent: "[ATLAS][URGENTE][LEGAL] Usuario con amenaza legal",
    refund_billing: "[ATLAS][URGENTE] Reembolso / cobro / cancelacion",
    saleads_technical: "[ATLAS] Usuario agota flujo de soporte tecnico",
    education: "[ATLAS] Caso educativo que requiere humano",
    unknown: "[ATLAS] Caso sin clasificar",
  };

  const ok = await sendEscalationEmail({
    subject: subjectByIntent[esc.reason] ?? `[ATLAS] Reenvio de escalamiento #${esc.id}`,
    summary: esc.summary,
    userMeta: {
      waId: session.id,
      profileName: (session.meta as { profile_name?: string })?.profile_name ?? null,
      program: session.program,
      email: session.email,
    },
    lastMessages: messages.reverse(),
    classificationTags: [esc.reason],
    reason: esc.reason,
  });

  if (ok) {
    await markEscalationEmailSent(esc.id);
    console.log(`\n✓ Email reenviado. Escalation #${esc.id} marcada como enviada.`);
  } else {
    console.error("✗ El envio fallo. Revisa logs.");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    log.error("resend_escalation fallo", { error: String(e).slice(0, 400) });
    process.exit(1);
  })
  .finally(async () => {
    const { closeDb } = await import("../src/db/client");
    await closeDb();
  });
