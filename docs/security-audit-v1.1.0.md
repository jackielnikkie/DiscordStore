# Security Audit — StoreMulti v1.1.0

Scope: attacker/AI-agent abuse of admin panel, APIs, webhooks, bots.
Method: read-only source review. Line numbers are as of audit time (16 files were mid-edit by parallel agents; re-verify anchors before patching).
No secret values are reproduced here.

---

## Executive summary — top 5 risks

1. **Login rate-limit bypass via spoofable `X-Forwarded-For` + in-memory-only counters** (`src/lib/auth.ts:17`, `:228`; `src/app/api/admin/login/route.ts:15`; `src/app/admin/actions.ts:56`). The limiter keys on the *first* XFF hop, which is client-controlled when Caddy appends rather than replaces. Combined with per-process `Map` state (cleared on restart, not shared across instances) and no proxy-level rate limit, `ADMIN_PASSWORD` brute force is effectively unthrottled; each attempt also burns a cost-12 bcrypt compare on the event loop.
2. **Unused production dependency `cn@0.1.1` pulls the abandoned `request@2.21` chain** (`package.json:21`). `npm audit --omit=dev`: 24 advisories → **5 critical, 16 high, 3 moderate** (critical: `next@^15.1.8` RCE/DoS set, `cn→request→form-data`, `concurrently→shell-quote` — and `concurrently` runs at container start per `Dockerfile:34`). No code imports `cn`; it is pure dead weight.
3. **Webhook/admin body read fully before any size check** (`src/app/api/webhooks/paymenku/route.ts:11-18`; `src/app/api/admin/products/[id]/stock/import/route.ts:21-24`). `request.text()` / `request.json()` buffer unbounded input into memory before `MAX_WEBHOOK_BODY_BYTES` is applied; `import` has no cap at all and then loops inside a SQLite transaction.
4. **Mention/markdown injection from untrusted usernames into Discord buy alerts** (`src/bot/services/buyAlert.ts:22-40`, `src/lib/discord.ts:59-69`). Telegram `first_name`/`username` is buyer-controlled and rendered into a Discord channel message with no `allowedMentions` restriction; `@everyone`/`@here`/role pings are achievable by renaming a Telegram account.
5. **Session/crypto hardening gaps** (`src/lib/crypto.ts:3-4`; `src/lib/auth.ts:9`, `:213-221`). `SESSION_SECRET` silently falls back to a per-process random value → all admin sessions silently invalidated on restart (and never shared across processes); cookie has no `__Host-` prefix, no idle timeout, 7-day absolute lifetime, `secure` only when `NODE_ENV=production`.

Authorization coverage is otherwise good: every `src/app/api/admin/**` handler calls `requireAdminApi`, and every mutating server action calls `requireAdminSession` (verified by full-tree grep). No endpoint leaks order data unauthenticated (`/api/order/success` returns a static string only).

---

## Findings

| ID | Sev | Area | File:line | Impact | Fix |
|----|-----|------|-----------|--------|-----|
| SEC-01 | high | Session/auth — rate limit | `src/app/api/admin/login/route.ts:15`; `src/app/admin/actions.ts:56-59`; `src/lib/auth.ts:228` | Client-supplied `X-Forwarded-For` first hop keys the IP bucket → trivially bypassed; also spoofs audit trail | Derive client IP from the **rightmost untrusted-hop** (or a trusted-proxy allowlist / Caddy `trusted_proxies`); prefer a proxy-enforced limit. |
| SEC-02 | high | Session/auth — rate limit | `src/lib/auth.ts:17`, `:224-241` | Counters are per-process in-memory: lost on restart, not shared if scaled, no persistence | Persist attempt windows in SQLite (already available) or enforce at Caddy; keep in-memory as fast-path only. |
| SEC-03 | high | Dependencies | `package.json:21`, `:26` | `cn` → `request@2.21` (critical SSRF/RCE/memory-exposure chain); `next@^15.1.8` critical RCE/DoS/SSRF set; `zod` high; `discord.js→undici` moderate | Remove `cn` (unused). Upgrade `next` to latest 15.x patched, `zod`, `discord.js`; pin via `npm audit` gate in CI (`--omit=dev`). |
| SEC-04 | high | DoS / body limits | `src/app/api/webhooks/paymenku/route.ts:11-18`; `src/app/api/admin/products/[id]/stock/import/route.ts:21-24`; `src/app/api/admin/products/[id]/stock/route.ts:32-35` | Unbounded buffering → memory exhaustion; import loops N rows inside one transaction | Enforce size via `Content-Length` + capped stream reader before parse; cap import line count (e.g. 5 000) and per-request byte cap. |
| SEC-05 | high | Injection — bot output | `src/bot/services/buyAlert.ts:26`, `:38-40`; `src/lib/discord.ts:59-69` | Buyer-controlled Telegram name → Discord message content; `@everyone`/role pings, markdown abuse in store channel | Pass `allowedMentions: { parse: [] }` to all channel sends; strip/neutralize control chars and backticks from untrusted names. |
| SEC-06 | medium | Injection — SQL | `src/lib/db.ts:259`, `:272`, `:363`, `:450`, `:462`, `:471-472`, `:493`, `:660-661`, `:669-685`, `:699-721` | Table/column/`ORDER BY`/`GROUP BY`/`SUM(field)`/`where` **keys** are string-interpolated. No current caller passes a user-derived key, but any future route using `where: { [param]: v }` becomes SQLi | Whitelist identifiers per model (map of allowed columns); reject unknown keys; never accept client keys. |
| SEC-07 | medium | Secret handling / availability | `src/lib/crypto.ts:3-4` | Missing `SESSION_SECRET` → random per process: silent logout on deploy, token hashes unusable across processes | Fail fast at boot when `SESSION_SECRET` is unset/short in production; document 32+ byte requirement. |
| SEC-08 | medium | Session/cookie | `src/lib/auth.ts:9`, `:213-221` | 7-day absolute session, no idle timeout, no `__Host-` prefix, `secure` conditional, no per-session rotation | Add idle expiry, `__Host-` prefix, always-`secure` in prod, rotate token on password change (already deletes all sessions). |
| SEC-09 | medium | Webhook logging | `src/app/api/webhooks/paymenku/route.ts:35-36` | `headersJson` persists **all** headers (incl. `x-paymenku-signature` and any proxy-injected cookie/auth) plus full `bodyJson` (PII: name/email) indefinitely | Store an allowlist of headers; redact signature/authorization/cookie; set a retention/TTL job. Not currently rendered in the admin UI (verified `admin/payments/page.tsx`). |
| SEC-10 | medium | Webhook reliability | `src/app/api/webhooks/paymenku/route.ts:42-57` | 200 returned before `processPayload`; process crash = order never fulfilled and provider will not retry | Persist a durable "pending process" flag and reconcile in the existing poller (`src/bot/index.ts:103-129`); or process synchronously and only 2xx on success. |
| SEC-11 | medium | Abuse / order spam | `src/bot/telegram/handlers.ts:277-287`, `:304-316`; `src/bot/handlers/interactionCreate.ts:91-145` | Callback `qty:` value is attacker-supplied and unbounded; `CUSTOM_TEXT` skips stock checks; no per-user rate limit → Paymenku transaction spam / DB growth | Clamp quantity server-side (e.g. ≤ product max, ≤ 100); per-user order cooldown (`createOrder` already reuses one PENDING invoice per product). |
| SEC-12 | low | Webhook flood | `src/app/api/webhooks/paymenku/route.ts:10-24` | Cheap 401s, but unbounded request rate at the edge | Add Caddy rate limit on `/api/webhooks/*`. |
| SEC-13 | low | Prompt-injection surface (AI agents) | `src/app/admin/orders/[id]/page.tsx:171`; `src/app/admin/orders/page.tsx:131`; `src/app/admin/products/[id]/stock/page.tsx:65`; `src/bot/services/embedSync.ts:58,68,73`; `src/bot/telegram/handlers.ts:349,441` | Buyer/stock text reaches admin HTML and bot messages/FM. Telegram HTML paths escape correctly (`escapeHtml`), but admin HTML and Discord embeds do not delimit untrusted content — an AI agent reading the panel can be instructed by stock lines / usernames | Wrap untrusted content in explicit delimiters or a typed "untrusted" component; strip control chars; never let stock content influence agent instructions. |
| SEC-14 | low | Access control | `src/bot/telegram/handlers.ts:518-524` | Force-join check fails **open** on any `getChatMember` error (documented as intentional) | Log loudly + alert; consider fail-closed for configured channels. |
| SEC-15 | low | Container / image | `Dockerfile:22` | Copies full builder tree (source + devDependencies) into the runtime image | Ship `.next/standalone` + pruned prod deps only. Runtime user is already non-root (`USER node`) and `.dockerignore:11-12` excludes `.env` — good. |
| SEC-16 | low | Redirects | `src/app/admin/actions.ts:560-570`, `:554-558` | Client `redirectTo` is used, but `redirectWithState` rebuilds from `url.pathname` only, so external hosts are dropped — no verified open redirect | Keep pathname-only construction; reject values not starting with `/admin`. |
| — | ok | Infra | `Caddyfile:5-13`, `next.config.ts:28-51`, `middleware.ts:11-46`, `docker-compose.yml:15-16` | HSTS + nosniff + DENY + Referrer-Policy present; CSP on `/admin`; admin APIs `no-store`; app port only `expose`d (not published) | Add `Permissions-Policy` and `X-Frame-Options` consistency already covered; consider tightening `script-src` with a nonce later. |
| — | ok | Webhook core | `src/lib/paymenku.ts:245-266`; `src/lib/crypto.ts:28-37` | HMAC-SHA256 over `timestamp.body`, 5-min tolerance, `timingSafeEqual`, length-guarded; rejects when secret/headers/TS missing | No change needed. Optionally add a nonce/idempotency key for exact-once. |
| — | ok | Secret masking | `src/lib/settings.ts:366-403`; `src/app/api/admin/settings/route.ts:22,53`; `src/app/admin/settings/payment/page.tsx:77,99,127` | `getMaskedSettingsSnapshot`/`maskSecret` used on API and pages; `env__admin_password_hash` is not part of `AppSettings` so it is never serialized | No change needed. |
| — | ok | `/api/order/success` | `src/app/api/order/success/route.ts:3-8` | Static JSON, no order data | No change needed. |

Note: `ADMIN_PASSWORD_HASH` empty returns a generic failure now (`src/lib/auth.ts:121-126`) and a dummy-hash compare equalizes timing (`:13-14`, `:117-119`) — username/config enumeration is handled.

---

## Hardening checklist v1.1.1 (ordered by effort)

1. Remove the unused `cn` dependency; re-run `npm audit --omit=dev` (`package.json:21`).
2. Add `allowedMentions: { parse: [] }` to all Discord channel sends; sanitize buyer names in buy alerts (`src/lib/discord.ts:59-69`, `src/bot/services/buyAlert.ts:22-40`).
3. Clamp quantities server-side and add a per-user order cooldown (`src/bot/telegram/handlers.ts:304-316`, `src/bot/handlers/interactionCreate.ts:91-145`).
4. Enforce body-size limits before parsing: webhook + stock import + stock add (`src/app/api/webhooks/paymenku/route.ts:11`, `src/app/api/admin/products/[id]/stock/import/route.ts:21`).
5. Fix client-IP derivation: use trusted-proxy/rightmost hop; persist login attempts in SQLite or move the limit to Caddy (`src/lib/auth.ts:17,228`, `src/app/api/admin/login/route.ts:15`).
6. Fail fast when `SESSION_SECRET` is missing/short in production (`src/lib/crypto.ts:3-4`).
7. `__Host-` cookie prefix, unconditional `secure` in prod, idle timeout (`src/lib/auth.ts:213-221`).
8. Redact/allowlist webhook headers; add TTL for `PaymentWebhookLog` (`src/app/api/webhooks/paymenku/route.ts:35`).
9. Make webhook processing durable across crashes (pending-process flag + poller reconcile) (`src/app/api/webhooks/paymenku/route.ts:42-57`).
10. Whitelist SQL identifiers in the shim as defense-in-depth (`src/lib/db.ts`).
11. Add a CI gate: `npm audit --omit=dev` + upgrade `next`/`zod`/`discord.js` to patched releases.
12. Wrap untrusted content (usernames, stock lines, delivery errors) in explicit delimiters for AI-agent legibility/containment (`src/app/admin/orders/[id]/page.tsx`, bot embed builders).
