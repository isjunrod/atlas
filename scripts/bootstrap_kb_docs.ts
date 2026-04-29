/**
 * Toma el markdown de kb/knowledge-base.md y lo parte en documentos
 * editables por Karen en el admin web. Cada seccion de segundo nivel
 * (`## ...`) se vuelve un documento independiente con su propio slug.
 *
 * Uso: bun run scripts/bootstrap_kb_docs.ts
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sql, closeDb } from "../src/db/client";
import { log } from "../src/logger";

interface Section {
  title: string;
  slug: string;
  body: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function parseSections(md: string): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      if (current) sections.push(current);
      const title = h2[1]!.trim();
      current = { title, slug: slugify(title), body: "" };
      continue;
    }
    if (current) current.body += line + "\n";
  }
  if (current) sections.push(current);

  return sections
    .map((s) => ({ ...s, body: s.body.trim() }))
    .filter((s) => s.body.length > 30);
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const mdPath = resolve(here, "../kb/knowledge-base.md");
  const md = readFileSync(mdPath, "utf8");

  const sections = parseSections(md);
  log.info(`Parseadas ${sections.length} secciones desde ${mdPath}`);

  const db = sql();
  let inserted = 0;
  let skipped = 0;

  // INSERT-only con skip si el slug ya existe. NO pisamos jamas un body
  // editado por Karen desde el admin. Si querés re-bootstrap-ear desde
  // cero, primero TRUNCATE kb_documents manualmente (operacion explicita).
  for (const s of sections) {
    const existing = await db<Array<{ id: number }>>`
      SELECT id FROM kb_documents WHERE slug = ${s.slug}
    `;
    if (existing.length > 0) {
      log.info(`skip (ya existe): ${s.slug}`);
      skipped++;
      continue;
    }
    await db`
      INSERT INTO kb_documents (slug, title, body, updated_by)
      VALUES (${s.slug}, ${s.title}, ${s.body}, 'bootstrap')
    `;
    inserted++;
  }

  log.info(`Insertados: ${inserted}, Saltados (ya existian): ${skipped}`);

  const all = await db<Array<{ slug: string; title: string }>>`
    SELECT slug, title FROM kb_documents ORDER BY title
  `;
  console.log("\n=== Documentos en kb_documents ===");
  for (const r of all) {
    console.log(`  ${r.slug.padEnd(50)}  ${r.title}`);
  }
}

main()
  .catch((e) => {
    log.error("bootstrap fallo", { error: String(e).slice(0, 400) });
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
