import { config } from "../config";
import { createHmac } from "node:crypto";

const COOKIE_NAME = "atlas_admin";
const MAX_AGE = 60 * 60 * 8; // 8h

function sign(value: string): string {
  return createHmac("sha256", config.ADMIN_SESSION_SECRET).update(value).digest("hex");
}

export function makeCookie(user: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${user}.${ts}`;
  const sig = sign(payload);
  const value = `${payload}.${sig}`;
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function verifyCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const raw = match.slice(COOKIE_NAME.length + 1);
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [user, ts, sig] = parts as [string, string, string];
  const payload = `${user}.${ts}`;
  if (sign(payload) !== sig) return null;
  const age = Math.floor(Date.now() / 1000) - Number(ts);
  if (age > MAX_AGE) return null;
  return user;
}

export function checkCreds(user: string, pass: string): boolean {
  return user === config.ADMIN_USER && pass === config.ADMIN_PASS;
}
