import postgres from "postgres";
import { config } from "../config";
import { log } from "../logger";

let _sql: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (!_sql) {
    if (!config.DATABASE_URL) {
      throw new Error("DATABASE_URL no configurada");
    }
    const needsSsl = /aivencloud\.com|sslmode=require/.test(config.DATABASE_URL);
    _sql = postgres(config.DATABASE_URL, {
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
    log.info("DB pool ready", { ssl: needsSsl });
  }
  return _sql;
}

export async function closeDb() {
  if (_sql) {
    await _sql.end();
    _sql = null;
  }
}
