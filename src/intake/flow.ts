import type { Session } from "../db/queries";
import { updateSession } from "../db/queries";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export interface IntakeOutcome {
  reply: string | null;
  continueToAgent: boolean;
}

function detectProgramFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bm5[\s-]?95\b|\bm-?595\b|meta ads.*5 ?95|5[ -]?95/.test(t)) return "m595";
  if (/academia del estratega|\bade\b|estratega/.test(t)) return "ade";
  if (/saleads academy|academia.saleads|rutas? de certificaci[oó]n/.test(t)) return "academy";
  if (/\bsaleads\b|sailads|sale[ -]?ads/.test(t)) return "saleads";
  return null;
}

function detectEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

function extractProgramFromReply(text: string): string | null {
  const t = text.toLowerCase().trim();
  if (/^a\b|^1\b|^uno\b|^m.?595|^m5|meta ads/.test(t)) return "m595";
  if (/^b\b|^2\b|^dos\b|ade|estratega/.test(t)) return "ade";
  if (/^c\b|^3\b|^tres\b|academy|academia\.saleads/.test(t)) return "academy";
  if (/^d\b|^4\b|^cuatro\b|^saleads|\bplataforma\b/.test(t)) return "saleads";
  return detectProgramFromText(text);
}

export async function runIntake(session: Session, text: string): Promise<IntakeOutcome> {
  const trimmed = text.trim();
  const detectedEmail = detectEmail(trimmed);
  const detectedProgram = detectProgramFromText(trimmed);

  const patch: Partial<Session> = {};
  if (!session.email && detectedEmail) patch.email = detectedEmail;
  if (!session.program && detectedProgram) patch.program = detectedProgram;

  // nuevo usuario: saludar y pedir programa
  if (session.intake_stage === "new") {
    if (patch.program) {
      if (patch.email) {
        await updateSession(session.id, { ...patch, intake_stage: "ready" });
        return { reply: null, continueToAgent: true };
      }
      await updateSession(session.id, { ...patch, intake_stage: "asked_email" });
      return {
        reply:
          "¡Hola! Somos el Equipo de Educacion SaleAds. Para ayudarte mejor, nos compartes el correo con el que hiciste tu compra? Luego te respondemos tu duda.",
        continueToAgent: false,
      };
    }
    await updateSession(session.id, { ...patch, intake_stage: "asked_program" });
    return {
      reply:
        "¡Hola! Somos el *Equipo de Educacion SaleAds*.\n\n" +
        "Para ayudarte mejor, cuentanos, ¿a que programa perteneces? Responde con la letra:\n\n" +
        "*A* · M5-95\n" +
        "*B* · Academia del Estratega (ADE)\n" +
        "*C* · SaleAds Academy (plataforma gratuita)\n" +
        "*D* · SaleAds (plataforma de publicidad)",
      continueToAgent: false,
    };
  }

  if (session.intake_stage === "asked_program") {
    const prog = extractProgramFromReply(trimmed) ?? patch.program;
    if (!prog) {
      return {
        reply:
          "No te entendimos, ¿nos confirmas la letra del programa? *A* M5-95, *B* ADE, *C* SaleAds Academy, *D* SaleAds.",
        continueToAgent: false,
      };
    }
    const nextPatch: Partial<Session> = { program: prog };
    if (patch.email) nextPatch.email = patch.email;
    // si el usuario ya escribio la duda completa + email, saltamos a ready
    if (trimmed.length > 60 && nextPatch.email) {
      await updateSession(session.id, { ...nextPatch, intake_stage: "ready" });
      return { reply: null, continueToAgent: true };
    }
    if (nextPatch.email) {
      await updateSession(session.id, { ...nextPatch, intake_stage: "ready" });
      return { reply: null, continueToAgent: true };
    }
    await updateSession(session.id, { ...nextPatch, intake_stage: "asked_email" });
    return {
      reply: "Perfecto. Ahora el correo con el que hiciste la compra.",
      continueToAgent: false,
    };
  }

  if (session.intake_stage === "asked_email") {
    if (!detectedEmail) {
      return {
        reply: "No vimos un correo valido. ¿Nos lo reenvias?",
        continueToAgent: false,
      };
    }
    await updateSession(session.id, { email: detectedEmail, intake_stage: "ready" });
    return {
      reply:
        "Gracias. Cuentanos tu duda con el mayor detalle posible y la resolvemos.",
      continueToAgent: false,
    };
  }

  // ready: continuar al agente
  if (Object.keys(patch).length > 0) {
    await updateSession(session.id, patch);
  }
  return { reply: null, continueToAgent: true };
}
