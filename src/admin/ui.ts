function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const BASE_STYLE = `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ATLAS — Admin</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: -apple-system, system-ui, sans-serif;
      background: #0b0d10; color: #e8eaed;
    }
    header {
      padding: 14px 22px; background: #12161b; border-bottom: 1px solid #1f262e;
      display: flex; justify-content: space-between; align-items: center;
    }
    header h1 { margin: 0; font-size: 18px; letter-spacing: 2px; }
    header small { color: #98a3ad; }
    main { max-width: 980px; margin: 30px auto; padding: 0 22px; }
    a { color: #6ea8fe; }
    .card {
      background: #12161b; border: 1px solid #1f262e; border-radius: 10px;
      padding: 20px; margin-bottom: 18px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #1f262e; }
    th { font-size: 12px; text-transform: uppercase; color: #98a3ad; }
    input, textarea, button {
      font-family: inherit; font-size: 14px;
      background: #0b0d10; color: #e8eaed; border: 1px solid #2b333c;
      padding: 10px 12px; border-radius: 6px; width: 100%;
    }
    textarea { min-height: 340px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
    label { display: block; font-size: 12px; color: #98a3ad; margin: 12px 0 4px; text-transform: uppercase; }
    .row { display: flex; gap: 12px; }
    .row > * { flex: 1; }
    button {
      background: #2c6bed; border-color: #2c6bed; cursor: pointer; font-weight: 600;
    }
    button:hover { background: #1e55c8; }
    button.ghost { background: transparent; border-color: #2b333c; }
    button.danger { background: #c2386e; border-color: #c2386e; }
    .flash { padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; }
    .flash.ok { background: #1f3b2a; color: #a7e9bb; }
    .flash.err { background: #3b1f28; color: #ef95b5; }
    pre.ingest { background: #0b0d10; padding: 12px; border-radius: 6px; overflow-x: auto; }
  </style>
</head>
<body>
`;

const FOOTER = `
</body>
</html>
`;

export function renderLogin(error?: string): string {
  return (
    BASE_STYLE +
    `<header><h1>ATLAS</h1><small>admin</small></header>
<main>
  <div class="card">
    <h2>Iniciar sesion</h2>
    ${error ? `<div class="flash err">${esc(error)}</div>` : ""}
    <form method="POST" action="/admin/login">
      <label>Usuario</label>
      <input name="user" autocomplete="username" />
      <label>Contrasena</label>
      <input name="pass" type="password" autocomplete="current-password" />
      <div style="height:14px"></div>
      <button type="submit">Entrar</button>
    </form>
  </div>
</main>` +
    FOOTER
  );
}

export function renderDashboard(opts: {
  user: string;
  docs: Array<{ id: number; slug: string; title: string; updated_at: Date }>;
  flash?: { ok?: string; err?: string };
  vectorStoreId?: string | null;
}): string {
  const rows = opts.docs
    .map(
      (d) => `
      <tr>
        <td><a href="/admin/kb/${esc(d.slug)}">${esc(d.title)}</a></td>
        <td><code>${esc(d.slug)}</code></td>
        <td>${new Date(d.updated_at).toLocaleString("es-CO")}</td>
        <td><form method="POST" action="/admin/kb/${esc(d.slug)}/delete" style="display:inline" onsubmit="return confirm('¿Eliminar este documento?')"><button class="ghost danger" type="submit">Eliminar</button></form></td>
      </tr>`
    )
    .join("");
  return (
    BASE_STYLE +
    `<header>
  <h1>ATLAS</h1>
  <small>Hola, ${esc(opts.user)} · <a href="/admin/logout">salir</a></small>
</header>
<main>
  ${opts.flash?.ok ? `<div class="flash ok">${esc(opts.flash.ok)}</div>` : ""}
  ${opts.flash?.err ? `<div class="flash err">${esc(opts.flash.err)}</div>` : ""}

  <div class="card">
    <h2>Base de conocimiento</h2>
    <p style="color:#98a3ad;">Cada documento se indexa en el vector store y alimenta las respuestas del bot.</p>
    <table>
      <thead><tr><th>Titulo</th><th>Slug</th><th>Actualizado</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" style="color:#98a3ad">No hay documentos aun.</td></tr>`}</tbody>
    </table>
    <div style="height:14px"></div>
    <a href="/admin/kb/new"><button>+ Nuevo documento</button></a>
  </div>

  <div class="card">
    <h2>Ingesta a OpenAI</h2>
    <p style="color:#98a3ad;">Publica el KB al vector store que usa ATLAS en produccion. Ejecuta esto despues de cambios importantes.</p>
    <div class="row">
      <div>Vector store actual: <code>${opts.vectorStoreId ? esc(opts.vectorStoreId) : "(sin configurar, se creara uno al primer ingest)"}</code></div>
    </div>
    <div style="height:14px"></div>
    <form method="POST" action="/admin/ingest">
      <button type="submit">Publicar KB al vector store</button>
    </form>
  </div>
</main>` +
    FOOTER
  );
}

export function renderDocEditor(opts: {
  mode: "new" | "edit";
  doc?: { slug: string; title: string; body: string };
  flash?: { ok?: string; err?: string };
}): string {
  const doc = opts.doc ?? { slug: "", title: "", body: "" };
  const action = opts.mode === "new" ? "/admin/kb" : `/admin/kb/${esc(doc.slug)}`;
  return (
    BASE_STYLE +
    `<header>
  <h1>ATLAS</h1>
  <small><a href="/admin">volver</a></small>
</header>
<main>
  ${opts.flash?.ok ? `<div class="flash ok">${esc(opts.flash.ok)}</div>` : ""}
  ${opts.flash?.err ? `<div class="flash err">${esc(opts.flash.err)}</div>` : ""}
  <div class="card">
    <h2>${opts.mode === "new" ? "Nuevo documento" : "Editar documento"}</h2>
    <form method="POST" action="${action}">
      <label>Titulo</label>
      <input name="title" value="${esc(doc.title)}" required />
      <label>Slug (identificador corto, solo letras/numeros/-)</label>
      <input name="slug" value="${esc(doc.slug)}" ${opts.mode === "edit" ? "readonly" : ""} required pattern="[a-z0-9\\-]+" />
      <label>Cuerpo (markdown)</label>
      <textarea name="body" required>${esc(doc.body)}</textarea>
      <div style="height:14px"></div>
      <button type="submit">Guardar</button>
    </form>
  </div>
</main>` +
    FOOTER
  );
}

export function renderIngestResult(ok: boolean, message: string): string {
  return (
    BASE_STYLE +
    `<header><h1>ATLAS</h1><small><a href="/admin">volver</a></small></header>
<main>
  <div class="card">
    <h2>Resultado de ingesta</h2>
    <div class="flash ${ok ? "ok" : "err"}">${esc(message)}</div>
    <pre class="ingest">${esc(message)}</pre>
  </div>
</main>` +
    FOOTER
  );
}
