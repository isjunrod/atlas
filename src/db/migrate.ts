import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sql, closeDb } from "./client";
import { log } from "../logger";

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const ddl = readFileSync(join(here, "schema.sql"), "utf8");
  const db = sql();
  log.info("Aplicando schema.sql...");
  await db.unsafe(ddl);
  log.info("Migracion completa");
  await closeDb();
}

main().catch((e) => {
  log.error("migrate failed", { error: String(e) });
  process.exit(1);
});
