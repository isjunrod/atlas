import { config, isSandbox } from "../config";
import { log } from "../logger";

const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_LEN = 3900;

interface SendResult {
  wamids: string[];
  ok: boolean;
}

function splitForWhatsapp(body: string): string[] {
  if (body.length <= MAX_LEN) return [body];
  const parts: string[] = [];
  let remaining = body;
  while (remaining.length > MAX_LEN) {
    let cut = remaining.lastIndexOf("\n\n", MAX_LEN);
    if (cut < MAX_LEN / 2) cut = remaining.lastIndexOf("\n", MAX_LEN);
    if (cut < MAX_LEN / 2) cut = remaining.lastIndexOf(" ", MAX_LEN);
    if (cut < MAX_LEN / 2) cut = MAX_LEN;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

async function postOne(to: string, text: string): Promise<string | null> {
  const url = `${GRAPH}/${config.WHATSAPP_PHONE_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text, preview_url: false },
    }),
  });
  if (!res.ok) {
    log.error("whatsapp send failed", {
      status: res.status,
      body: (await res.text()).slice(0, 400),
    });
    return null;
  }
  const data = (await res.json()) as { messages?: Array<{ id: string }> };
  return data.messages?.[0]?.id ?? null;
}

export async function sendWhatsapp(to: string, body: string): Promise<SendResult> {
  if (isSandbox()) {
    log.warn("sandbox mode: skipping WhatsApp send", { to, preview: body.slice(0, 80) });
    return { wamids: [], ok: true };
  }
  const parts = splitForWhatsapp(body);
  log.info("bot reply", { to, parts: parts.length, text: body });
  const wamids: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const id = await postOne(to, parts[i]!);
    if (id) wamids.push(id);
    if (i < parts.length - 1) await new Promise((r) => setTimeout(r, 600));
  }
  return { wamids, ok: wamids.length === parts.length };
}
