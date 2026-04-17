# ATLAS

Agente de soporte de WhatsApp para el Equipo de Educacion SaleAds. Primer filtro antes de escalar a un humano.

- Responde dudas sobre programas (M5-95, ADE, SaleAds Academy), bonos, grupos, metodologia ESFERA, verificacion de Business Manager.
- Redirige consultas tecnicas de la plataforma SaleAds al canal correcto.
- Escala a Karen por email cuando detecta cancelaciones, reembolsos o amenazas legales.
- Karen edita el KB desde un admin web y dispara la re-ingesta al vector store de OpenAI.

## Stack

- Runtime: Bun
- Framework web: Hono
- LLM: OpenAI (default `gpt-4.1-mini`, fallback `gpt-4o-mini`)
- Retrieval: OpenAI `vector_stores.search`
- DB: Postgres (Aiven)
- WhatsApp: Meta Cloud API directa
- Notify: SMTP (email a director.educacion@adschool.agency)
- Deploy: Docker + Kubernetes (Rackspace Spot)

## Estructura

```
atlas/
├── src/
│   ├── index.ts               # Hono server
│   ├── config.ts              # env vars parseadas con zod
│   ├── logger.ts
│   ├── webhook/handler.ts     # procesa webhooks Meta
│   ├── intake/flow.ts         # flujo hibrido programa+email+duda
│   ├── router/classifier.ts   # intent: education | refund | legal | saleads_tech
│   ├── agent/                 # RAG: search + LLM + prompts
│   ├── handlers/              # educacion / escalate / redirects
│   ├── notify/email.ts        # escalate via SMTP
│   ├── admin/                 # panel web para editar KB e ingestar
│   ├── db/                    # postgres client + schema + migraciones
│   └── wa/                    # Meta Cloud API client
├── kb/knowledge-base.md       # seed inicial del KB
├── scripts/ingest_kb.ts       # CLI para subir KB al vector store
├── k8s/                       # deployment, service, secret example
└── Dockerfile
```

## Setup local

```bash
cp .env.example .env
# editar .env con credenciales

bun install
bun run src/db/migrate.ts           # crea tablas
bun run scripts/ingest_kb.ts kb/knowledge-base.md   # ingesta inicial
bun run dev                         # levanta en :8080
```

Admin: http://localhost:8080/admin (user/pass segun `.env`).

## Configurar Meta webhook

1. Dashboard de la app de Meta — WhatsApp — Configuration.
2. Callback URL: `https://<tu-dominio>/webhook/whatsapp`.
3. Verify token: el valor de `WHATSAPP_VERIFY_TOKEN`.
4. Suscribir a `messages`.

## Deploy a Rackspace K8s

```bash
export KUBECONFIG=/ruta/al/kubeconfig
kubectl apply -f k8s/namespace.yaml
# crear el secret real (ver k8s/secret.example.yaml)
kubectl apply -f k8s/deployment.yaml
```

Build + push:

```bash
docker build -t juanads/atlas:$(date +%Y%m%d-%H%M) -t juanads/atlas:latest .
docker push juanads/atlas:latest
kubectl -n atlas rollout restart deployment/atlas
```

## Flujo de un mensaje

1. Meta envia el webhook a `/webhook/whatsapp`.
2. Server responde 200 inmediato y procesa en background.
3. Se de-duplica por `wamid` (tabla `webhook_events`).
4. Fast-path para saludos/gracias (sin LLM).
5. `runIntake` captura programa y email si aun no los tenemos.
6. `classifyIntent` rutea segun el texto:
   - `legal_urgent` o `refund_billing` — escala por email + responde plantilla.
   - `saleads_technical` — redirect al soporte de SaleAds.
   - `education` (default) — RAG sobre el vector store y LLM.
7. El mensaje saliente se segmenta si pasa el limite de WhatsApp.

## Seguridad

- No hay endpoints publicos de escritura sin cookie de admin firmada (HMAC sha256).
- Secrets por K8s `Secret`, nunca en el repo.
- `webhook_events` da idempotencia ante reintentos de Meta.
