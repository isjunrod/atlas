export interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: Array<{ id?: string; status?: string }>;
      };
    }>;
  }>;
}

export interface ParsedInbound {
  wamid: string;
  waId: string;
  profileName: string | null;
  text: string;
  type: string;
  timestamp: string;
}

export function parseInbound(payload: MetaWebhookBody): ParsedInbound[] {
  const out: ParsedInbound[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value || change.field !== "messages") continue;
      const contact = value.contacts?.[0];
      const profileName = contact?.profile?.name ?? null;
      for (const m of value.messages ?? []) {
        if (!m.id || !m.from) continue;
        const text = m.text?.body ?? "";
        out.push({
          wamid: m.id,
          waId: m.from,
          profileName,
          text,
          type: m.type ?? "unknown",
          timestamp: m.timestamp ?? "",
        });
      }
    }
  }
  return out;
}
