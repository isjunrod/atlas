import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  WHATSAPP_PHONE_ID: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).default("atlas-verify-token-change-me"),

  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4.1-mini"),
  ATLAS_VECTOR_STORE_ID: z.string().min(1).optional(),
  ATLAS_FALLBACK_MODEL: z.string().default("gpt-4o-mini"),

  DATABASE_URL: z.string().min(1).optional(),

  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  ESCALATION_EMAIL_TO: z.string().default("director.educacion@adschool.agency"),
  ESCALATION_EMAIL_FROM: z.string().default("ATLAS <atlas-bot@example.com>"),

  ADMIN_USER: z.string().default("karen"),
  ADMIN_PASS: z.string().default("change_me"),
  ADMIN_SESSION_SECRET: z.string().default("atlas-dev-secret-change-me"),

  CONTEXT_RECENT_TURNS: z.coerce.number().default(8),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid env config:", parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;

export const isSandbox = () =>
  !config.WHATSAPP_ACCESS_TOKEN ||
  !config.WHATSAPP_PHONE_ID ||
  !config.OPENAI_API_KEY;
