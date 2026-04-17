import { sql } from "../db/client";

export interface KbDoc {
  id: number;
  slug: string;
  title: string;
  body: string;
  updated_at: Date;
  updated_by: string | null;
}

export async function listDocs(): Promise<Array<Pick<KbDoc, "id" | "slug" | "title" | "updated_at">>> {
  const db = sql();
  return await db`
    SELECT id, slug, title, updated_at
    FROM kb_documents
    ORDER BY title ASC
  `;
}

export async function getDoc(slug: string): Promise<KbDoc | null> {
  const db = sql();
  const rows = await db<KbDoc[]>`
    SELECT * FROM kb_documents WHERE slug = ${slug} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function upsertDoc(input: {
  slug: string;
  title: string;
  body: string;
  updatedBy: string;
}): Promise<KbDoc> {
  const db = sql();
  const existing = await getDoc(input.slug);
  if (existing) {
    await db`
      INSERT INTO kb_revisions (document_id, body, created_by)
      VALUES (${existing.id}, ${existing.body}, ${input.updatedBy})
    `;
  }
  const rows = await db<KbDoc[]>`
    INSERT INTO kb_documents (slug, title, body, updated_by)
    VALUES (${input.slug}, ${input.title}, ${input.body}, ${input.updatedBy})
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      updated_at = now(),
      updated_by = EXCLUDED.updated_by
    RETURNING *
  `;
  return rows[0]!;
}

export async function deleteDoc(slug: string): Promise<void> {
  const db = sql();
  await db`DELETE FROM kb_documents WHERE slug = ${slug}`;
}

export async function exportMarkdown(): Promise<string> {
  const db = sql();
  const rows = await db<Array<Pick<KbDoc, "slug" | "title" | "body">>>`
    SELECT slug, title, body
    FROM kb_documents
    ORDER BY slug ASC
  `;
  const parts: string[] = [];
  for (const r of rows) {
    parts.push(`# ${r.title}\n\n_slug: ${r.slug}_\n\n${r.body.trim()}\n`);
  }
  return parts.join("\n---\n\n");
}
