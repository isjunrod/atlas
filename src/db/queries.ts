import { sql } from "./client";

export type IntakeStage = "new" | "asked_program" | "asked_email" | "ready";

export interface Session {
  id: string;
  program: string | null;
  email: string | null;
  intake_stage: IntakeStage;
  escalated: boolean;
  first_seen_at: Date;
  last_seen_at: Date;
  meta: Record<string, unknown>;
}

export async function getOrCreateSession(waId: string): Promise<Session> {
  const db = sql();
  const rows = await db<Session[]>`
    INSERT INTO sessions (id)
    VALUES (${waId})
    ON CONFLICT (id) DO UPDATE SET last_seen_at = now()
    RETURNING *
  `;
  return rows[0]!;
}

export async function updateSession(
  sessionId: string,
  patch: Partial<Pick<Session, "program" | "email" | "intake_stage" | "escalated">>
): Promise<void> {
  const db = sql();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (patch.escalated) {
    fields.push(`escalated_at = now()`);
  }
  if (!fields.length) return;
  values.push(sessionId);
  await db.unsafe(
    `UPDATE sessions SET ${fields.join(", ")}, last_seen_at = now() WHERE id = $${i}`,
    values as never[]
  );
}

export async function insertMessage(
  sessionId: string,
  direction: "in" | "out",
  body: string,
  opts: { wamid?: string; meta?: Record<string, unknown> } = {}
): Promise<void> {
  const db = sql();
  const metaJson = JSON.stringify(opts.meta ?? {});
  await db`
    INSERT INTO messages (session_id, direction, body, wamid, meta)
    VALUES (${sessionId}, ${direction}, ${body}, ${opts.wamid ?? null}, ${metaJson}::jsonb)
  `;
}

export async function getRecentMessages(
  sessionId: string,
  limit: number
): Promise<Array<{ direction: "in" | "out"; body: string; created_at: Date }>> {
  const db = sql();
  const rows = await db<Array<{ direction: "in" | "out"; body: string; created_at: Date }>>`
    SELECT direction, body, created_at
    FROM messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.reverse();
}

export async function markWebhookProcessed(wamid: string): Promise<boolean> {
  const db = sql();
  const rows = await db<Array<{ inserted: boolean }>>`
    INSERT INTO webhook_events (wamid)
    VALUES (${wamid})
    ON CONFLICT (wamid) DO NOTHING
    RETURNING true AS inserted
  `;
  return rows.length > 0;
}

export async function recordEscalation(
  sessionId: string,
  reason: string,
  summary: string
): Promise<number> {
  const db = sql();
  const rows = await db<Array<{ id: number }>>`
    INSERT INTO escalations (session_id, reason, summary)
    VALUES (${sessionId}, ${reason}, ${summary})
    RETURNING id
  `;
  return rows[0]!.id;
}

export async function markEscalationEmailSent(escalationId: number): Promise<void> {
  const db = sql();
  await db`UPDATE escalations SET email_sent_at = now() WHERE id = ${escalationId}`;
}
