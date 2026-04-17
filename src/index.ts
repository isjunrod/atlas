import { Hono } from "hono";
import { config } from "./config";
import { log } from "./logger";
import { handleWebhookPayload } from "./webhook/handler";
import type { MetaWebhookBody } from "./wa/types";
import { adminRoutes } from "./admin/routes";
import { sql } from "./db/client";

const app = new Hono();

app.get("/health", async (c) => {
  try {
    await sql()`SELECT 1`;
    return c.json({ status: "OK", mode: config.NODE_ENV });
  } catch (e) {
    log.warn("health db fail", { error: String(e).slice(0, 200) });
    return c.json({ status: "DEGRADED", db: "down" }, 503);
  }
});

// Meta webhook handshake (GET)
app.get("/webhook/whatsapp", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode === "subscribe" && token === config.WHATSAPP_VERIFY_TOKEN && challenge) {
    log.info("webhook handshake ok");
    return c.text(challenge, 200);
  }
  log.warn("webhook handshake mismatch", { mode, tokenMatch: token === config.WHATSAPP_VERIFY_TOKEN });
  return c.text("forbidden", 403);
});

// Meta webhook deliver (POST)
app.post("/webhook/whatsapp", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as MetaWebhookBody;
  // responder rapido al webhook (< 5s segun Meta) y procesar en background
  queueMicrotask(() => {
    handleWebhookPayload(body).catch((e) =>
      log.error("handleWebhookPayload fallo", { error: String(e).slice(0, 400) })
    );
  });
  return c.text("ok", 200);
});

app.route("/admin", adminRoutes);

app.get("/", (c) =>
  c.json({
    name: "ATLAS",
    role: "Agente de soporte de Equipo de Educacion SaleAds",
    health: "/health",
    admin: "/admin",
  })
);

const port = config.PORT;
log.info(`ATLAS listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 30,
};
