import OpenAI, { toFile } from "openai";
import { config, isSandbox } from "../config";
import { sql } from "../db/client";
import { log } from "../logger";
import { exportMarkdown } from "./kb_store";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: config.OPENAI_API_KEY! });
  return _client;
}

export async function ingestKB(opts: { vectorStoreName?: string } = {}): Promise<{
  vectorStoreId: string;
  fileId: string;
  status: "completed" | "failed" | "pending";
}> {
  if (isSandbox()) {
    throw new Error("No se puede ingestar en sandbox (sin OPENAI_API_KEY).");
  }

  const c = client();
  const markdown = await exportMarkdown();
  if (!markdown.trim()) throw new Error("KB vacio, nada para ingestar.");

  const db = sql();
  const started = await db<Array<{ id: number }>>`
    INSERT INTO kb_ingests (vector_store_id, status, documents_count)
    VALUES ('pending', 'pending', 0)
    RETURNING id
  `;
  const ingestId = started[0]!.id;

  try {
    // crear o reusar vector store
    let vectorStoreId = config.ATLAS_VECTOR_STORE_ID;
    if (!vectorStoreId) {
      const vs = await c.vectorStores.create({
        name: opts.vectorStoreName ?? "atlas-kb",
      });
      vectorStoreId = vs.id;
      log.info("vector store creado", { id: vectorStoreId });
    }

    const filename = `atlas-kb-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
    const file = await c.files.create({
      file: await toFile(Buffer.from(markdown, "utf8"), filename, { type: "text/markdown" }),
      purpose: "assistants",
    });

    const attached = await c.vectorStores.files.createAndPoll(vectorStoreId, {
      file_id: file.id,
    });

    const status = attached.status === "completed" ? "completed" : "failed";
    await db`
      UPDATE kb_ingests
      SET vector_store_id = ${vectorStoreId},
          file_id = ${file.id},
          status = ${status},
          documents_count = ${markdown.split(/\n---\n/).length},
          finished_at = now()
      WHERE id = ${ingestId}
    `;

    log.info("ingest terminado", {
      vectorStoreId,
      fileId: file.id,
      status: attached.status,
    });
    return { vectorStoreId, fileId: file.id, status };
  } catch (e) {
    const err = String(e).slice(0, 500);
    await db`
      UPDATE kb_ingests
      SET status = 'failed', error = ${err}, finished_at = now()
      WHERE id = ${ingestId}
    `;
    log.error("ingest fallo", { error: err });
    throw e;
  }
}
