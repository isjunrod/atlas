/**
 * Script CLI para ingestar un archivo markdown del KB al vector store de OpenAI.
 *
 * Uso:
 *   bun run scripts/ingest_kb.ts kb/knowledge-base.md
 *
 * Tambien se puede hacer desde el admin web: /admin/ingest. Este script es util
 * en bootstraps iniciales o cuando el admin web no esta disponible.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI, { toFile } from "openai";
import { config, isSandbox } from "../src/config";
import { log } from "../src/logger";

async function main() {
  if (isSandbox()) {
    console.error("Requiere OPENAI_API_KEY definido.");
    process.exit(1);
  }

  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: bun run scripts/ingest_kb.ts <ruta-al-markdown>");
    process.exit(1);
  }
  const full = resolve(filePath);
  if (!existsSync(full)) {
    console.error(`Archivo no existe: ${full}`);
    process.exit(1);
  }
  const body = readFileSync(full, "utf8");
  if (!body.trim()) {
    console.error("Archivo vacio.");
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY! });

  let vectorStoreId = config.ATLAS_VECTOR_STORE_ID;
  if (!vectorStoreId) {
    const vs = await client.vectorStores.create({ name: "atlas-kb" });
    vectorStoreId = vs.id;
    log.info("Vector store creado", { id: vectorStoreId });
    console.log(`\n⚠️  Setea en el deployment: ATLAS_VECTOR_STORE_ID=${vectorStoreId}\n`);
  }

  const filename = full.split("/").pop() ?? "atlas-kb.md";
  const uploaded = await client.files.create({
    file: await toFile(Buffer.from(body, "utf8"), filename, { type: "text/markdown" }),
    purpose: "assistants",
  });
  log.info("Archivo subido", { id: uploaded.id });

  const attached = await client.vectorStores.files.createAndPoll(vectorStoreId, {
    file_id: uploaded.id,
  });
  log.info("Attach completo", { status: attached.status });

  console.log(`\n✔ Ingesta ${attached.status}`);
  console.log(`vector_store_id: ${vectorStoreId}`);
  console.log(`file_id: ${uploaded.id}`);
}

main().catch((e) => {
  log.error("ingest fallo", { error: String(e).slice(0, 500) });
  process.exit(1);
});
