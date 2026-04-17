/**
 * Clasifica el intent de un mensaje. Decide si:
 *   - saleads_technical: problemas tecnicos de la plataforma SaleAds (redirect a support)
 *   - refund_billing: cancelaciones, reembolsos, cobros no autorizados (escalate urgente)
 *   - legal_urgent: amenazas legales, SIC, demanda (escalate maxima urgencia)
 *   - education: dudas de contenido, metodologia, bonos, grupos, Juan IA (responder con RAG)
 *   - unknown: no matchea ninguno (default a education con RAG)
 */

export type Intent =
  | "saleads_technical"
  | "refund_billing"
  | "legal_urgent"
  | "education"
  | "unknown";

export interface ClassifyResult {
  intent: Intent;
  tags: string[];
  reason: string;
}

const LEGAL_MARKERS = [
  "sic",
  "superintendencia",
  "demanda",
  "denuncia",
  "ley 1480",
  "ley 2439",
  "reversion",
  "reversión",
  "chargeback",
  "contracargo",
  "abogado",
  "juridic",
  "incumplimiento",
];

const REFUND_MARKERS = [
  "reembolso",
  "devoluci",
  "cancelar",
  "cancelaci",
  "cobro no autorizad",
  "me están cobr",
  "me estan cobr",
  "cobros duplicad",
];

const SALEADS_TECH_MARKERS = [
  "no me funciona la plataforma",
  "no puedo entrar a saleads",
  "error en saleads",
  "no cargan mis creditos",
  "no cargan mis créditos",
  "no me deja crear campan",
  "no se conecta meta",
  "no se vincula meta",
  "no se conecta whatsapp",
  "no se conecta instagram",
  "no se vincula google",
  "saleads no funciona",
  "bug de saleads",
];

function countMatches(text: string, markers: string[]): number {
  const t = text.toLowerCase();
  return markers.filter((m) => t.includes(m)).length;
}

export function classifyIntent(text: string): ClassifyResult {
  const t = text.toLowerCase();
  const tags: string[] = [];

  const legalHits = countMatches(t, LEGAL_MARKERS);
  const refundHits = countMatches(t, REFUND_MARKERS);
  const techHits = countMatches(t, SALEADS_TECH_MARKERS);

  if (legalHits > 0) tags.push("legal");
  if (refundHits > 0) tags.push("refund");
  if (techHits > 0) tags.push("tech");

  if (legalHits > 0) {
    return {
      intent: "legal_urgent",
      tags,
      reason: "Contiene marcadores legales (SIC, demanda, incumplimiento).",
    };
  }
  if (refundHits > 0) {
    return {
      intent: "refund_billing",
      tags,
      reason: "Contiene marcadores de cancelacion / reembolso / cobro.",
    };
  }
  if (techHits > 0) {
    return {
      intent: "saleads_technical",
      tags,
      reason: "Problema tecnico explicito de la plataforma SaleAds.",
    };
  }

  // default: education (el RAG se encarga)
  return { intent: "education", tags, reason: "Default education (sin marcadores criticos)." };
}
