import { Hono } from "hono";
import type { Context } from "hono";
import { checkCreds, clearCookie, makeCookie, verifyCookie } from "./auth";
import { deleteDoc, getDoc, listDocs, upsertDoc } from "./kb_store";
import { ingestKB } from "./ingest";
import { renderDashboard, renderDocEditor, renderIngestResult, renderLogin } from "./ui";
import { config } from "../config";
import { log } from "../logger";

export const adminRoutes = new Hono();

function requireAuth(c: Context): string | null {
  return verifyCookie(c.req.header("cookie"));
}

adminRoutes.get("/login", (c) => c.html(renderLogin()));

adminRoutes.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const user = String(form.user ?? "");
  const pass = String(form.pass ?? "");
  if (!checkCreds(user, pass)) {
    return c.html(renderLogin("Credenciales invalidas"));
  }
  c.header("Set-Cookie", makeCookie(user));
  return c.redirect("/admin", 302);
});

adminRoutes.get("/logout", (c) => {
  c.header("Set-Cookie", clearCookie());
  return c.redirect("/admin/login", 302);
});

adminRoutes.get("/", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.redirect("/admin/login", 302);
  const docs = await listDocs();
  return c.html(
    renderDashboard({
      user,
      docs,
      vectorStoreId: config.ATLAS_VECTOR_STORE_ID ?? null,
    })
  );
});

adminRoutes.get("/kb/new", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.redirect("/admin/login", 302);
  return c.html(renderDocEditor({ mode: "new" }));
});

adminRoutes.post("/kb", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.redirect("/admin/login", 302);
  const form = await c.req.parseBody();
  const slug = String(form.slug ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  const title = String(form.title ?? "").trim();
  const body = String(form.body ?? "").trim();
  if (!slug || !title || !body) {
    return c.html(renderDocEditor({ mode: "new", flash: { err: "Faltan campos" } }));
  }
  await upsertDoc({ slug, title, body, updatedBy: user });
  return c.redirect("/admin", 302);
});

adminRoutes.get("/kb/:slug", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.redirect("/admin/login", 302);
  const slug = c.req.param("slug");
  const doc = await getDoc(slug);
  if (!doc) return c.notFound();
  return c.html(renderDocEditor({ mode: "edit", doc }));
});

adminRoutes.post("/kb/:slug", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.redirect("/admin/login", 302);
  const slug = c.req.param("slug");
  const form = await c.req.parseBody();
  const title = String(form.title ?? "").trim();
  const body = String(form.body ?? "").trim();
  if (!title || !body) {
    const doc = await getDoc(slug);
    return c.html(
      renderDocEditor({ mode: "edit", doc: doc ?? undefined, flash: { err: "Faltan campos" } })
    );
  }
  await upsertDoc({ slug, title, body, updatedBy: user });
  return c.redirect("/admin", 302);
});

adminRoutes.post("/kb/:slug/delete", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.redirect("/admin/login", 302);
  await deleteDoc(c.req.param("slug"));
  return c.redirect("/admin", 302);
});

adminRoutes.post("/ingest", async (c) => {
  const user = requireAuth(c);
  if (!user) return c.redirect("/admin/login", 302);
  try {
    const result = await ingestKB();
    const msg = `Ingesta ${result.status.toUpperCase()}\nvector_store_id: ${result.vectorStoreId}\nfile_id: ${result.fileId}\n\nSi es la primera vez o cambio de vector store, actualiza ATLAS_VECTOR_STORE_ID=${result.vectorStoreId} en el deployment.`;
    return c.html(renderIngestResult(result.status === "completed", msg));
  } catch (e) {
    log.error("admin ingest fallo", { error: String(e).slice(0, 300) });
    return c.html(renderIngestResult(false, `Error: ${String(e).slice(0, 500)}`));
  }
});
