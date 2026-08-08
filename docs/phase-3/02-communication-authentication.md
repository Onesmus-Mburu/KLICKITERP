# KLICKIT FINANCE ERP — Phase 3

## System Architecture (Part 2 of 3): Communication Architecture & Authentication Flows

| Field | Value |
|---|---|
| **Document ID** | KFE-ARC-002 |
| **Version** | 1.0 |
| **Date** | 14 July 2026 |
| **Companions** | KFE-ARC-001 (Structure), KFE-ARC-003 (Deployment) |

---

# 1. Communication Architecture

## 1.1 Channel matrix — every interaction and its transport

| Interaction | Transport | Pattern | Why |
|---|---|---|---|
| Browser/PWA ↔ backend | HTTPS REST `/api/v1` | Request/response, JSON envelope | Uniform public API (FR-API-001); cacheable; offline-friendly retry semantics |
| Live updates (dashboard KPIs, STK confirmations, notification badge, approval arrivals) | WebSocket (Socket.IO, `/ws`, Redis adapter) | Server push, room-per-user + role rooms | FR-DASH-009, UC-PAY-02 live confirm; multi-replica safe via Redis pub/sub |
| Module → module (same transaction) | In-process service call | Synchronous, composed transaction | D1 — money spans modules atomically (e.g., receipt→wallet debit→GL) |
| Module → module (reaction) | Domain event via **transactional outbox** → dispatcher | Async pub/sub, at-least-once, idempotent handlers | Decoupling without 2-phase commit; survives crashes |
| Heavy/deferred work (bulk billing, report renders, comms sends, backup, late fees, depreciation, statement imports) | BullMQ queues (Redis) | Job + retry/backoff + DLQ | D6 isolation in worker process |
| Scheduled work | Cron (worker; `@nestjs/schedule`) enqueuing jobs | Tick → job | Single-scheduler guarantee via Redis lock (multi-replica safe) |
| Outbound integrations (M-Pesa, SMS, SMTP, FCM, accounting SaaS, webhooks) | HTTPS via per-provider adapter classes behind ports (interfaces) | Queued command + result callback/poll | FR-INTG-008 failure isolation; provider swap = new adapter |
| Inbound callbacks (M-Pesa STK/C2B, B2C results) | HTTPS POST to `/callbacks/*` (Nginx-routed, rate-limited, signature/IP validated) | Idempotent event ingestion | BR-PAY-06; raw payload persisted before processing |
| Super Admin ↔ instance | HTTPS `/license/v1/*` mutual-auth | Enumerated request/response only | FR-LIC-002/003 |

## 1.2 Queue topology (BullMQ)

| Queue | Jobs | Concurrency (worker default) | Retry policy |
|---|---|---|---|
| `billing` | bulk-billing chunks, late-fee batches, recurring billing drafts | 2 | 3×, exp 30s |
| `comms.sms` / `comms.email` / `comms.push` | one job per message | 5 / 5 / 10 | 5×, exp 30s→16m, DLQ |
| `mpesa` | STK status queries, B2C submissions/result timeouts, C2B post-processing | 3 | per-flow (status query ×3 then FAILED) |
| `reports` | background report renders, scheduled reports | 2 | 2× |
| `accounting` | integrity sweep, depreciation batch, period-close checks | 1 (serialized) | manual retry |
| `sync` | QuickBooks/Xero/Sage pushes | 1 | 8×, exp, DLQ + admin alert |
| `webhooks` | outbound webhook deliveries | 5 | 8× over 24h, auto-disable rule |
| `ops` | backups, backup verification, retention pruning, health probes | 1 | alert on failure |

Rules: jobs carry `idempotency_key`; processors check-and-record completion (exactly-once effect over at-least-once delivery); every DLQ surfaces on `/ops` with requeue action (NFR-AVL-005).

## 1.3 Transactional outbox — the money-safe event path

```
┌── business transaction (api or worker) ─────────────────┐
│ 1. mutate document(s)                                   │
│ 2. PostingService.post(...)  → gl_journal*              │
│ 3. INSERT INTO outbox (event_type, aggregate, payload)  │
│ COMMIT ─────────────────────────────────────────────────┘
        └─▶ outbox dispatcher (worker, 250ms poll / LISTEN-NOTIFY):
            reads unpublished rows in aggregate order →
            (a) in-process handlers (read-model updates)
            (b) BullMQ enqueue (comms, sync, webhooks)
            marks published; handler failures retry independently
```

Guarantee: an event exists **iff** its transaction committed — notifications can never announce a receipt that rolled back, and a crash after commit still delivers (at-least-once, handlers idempotent).

## 1.4 WebSocket rooms & events

| Room | Events |
|---|---|
| `user:{id}` | `notification.new`, `approval.assigned`, `job.completed` (report ready, import done) |
| `role:cashier:{till}` | `mpesa.stk.confirmed`, `mpesa.stk.failed` |
| `screen:dashboard` | `dashboard.kpi.updated` (debounced 5 s) |
| `ops` | `queue.dlq.grew`, `integrity.sweep.failed`, `backup.finished` |

Auth: connection handshake presents the JWT; socket joins rooms per identity/permissions; reconnect resumes with event replay from a 5-minute Redis ring buffer (missed-update tolerance).

## 1.5 Integration ports & adapters

```
comms:   SmsPort ─── AfricasTalkingAdapter | GenericHttpSmsAdapter | (WhatsAppAdapter: reserved)
         MailPort ── SmtpAdapter
         PushPort ── FcmAdapter
payments: MpesaPort ─ DarajaAdapter (STK, C2B, B2C, status, reversal; sandbox|production)
banking: BankStatementPort ─ CsvAdapter | OfxAdapter | Mt940Adapter | (per-bank API adapters)
sync:    AccountingSyncPort ─ QuickBooksAdapter | XeroAdapter | SageAdapter
```

Adapters are the only code aware of provider wire formats; all are configured via Settings-encrypted credentials with `testConnection()` (FR-SET-003.1); all calls logged with `request_id` + provider reference.

# 2. Authentication & Authorization Flows

## 2.1 Staff login (password + TOTP) — FR-AUTH-001/004

```
Browser                 API (auth module)                       Redis/DB
  │ POST /auth/login {id, pw}                                      │
  ├──────────────────▶ verify status, IP policy, lockout counter ──┤
  │                    bcrypt.compare; if 2FA: issue pre-auth      │
  │ ◀── 200 {stage:"2fa", preauth_token(90s)}                      │
  │ POST /auth/2fa/verify {preauth_token, totp}                    │
  ├──────────────────▶ TOTP window ±1; replay-guard per code ──────┤
  │                    create Session row; sign JWT(15m)           │
  │                    set refresh cookie (httpOnly, Secure,       │
  │                    SameSite=Strict, path=/api/v1/auth)         │
  │ ◀── 200 {user, perms, must_change_password?}                   │
```

- Access JWT: `sub, sid, roles, perms_hash, typ:access` — 15 min, ES256 (rotatable keypair, `kid` header).
- Refresh: opaque 256-bit token, hash stored on Session; **rotation on every refresh**; reuse of a rotated token → revoke session family + security notification (FR-AUTH-002.1).
- Failure responses uniform (no user enumeration); counters in Redis with 15-min windows.

## 2.2 Parent OTP login — FR-AUTH-013

`POST /auth/otp/request {phone}` → rate checks (3/hr/phone, 10/hr/IP) → 6-digit OTP hashed to Redis (TTL 5 min) → SMS via comms queue → `POST /auth/otp/verify` (≤5 attempts) → session limited to `parent` role scope; linked-students claim resolved server-side per request (BR-SEC-03 — never trusted from token).

## 2.3 Request authorization pipeline (every API call)

```
Nginx (TLS, rate zone, request_id)
 → JwtAuthGuard (signature, expiry, session not revoked — Redis sid check)
 → LicenseGuard (state: ACTIVE/GRACE pass; SUSPENDED → mutations 403 LICENSE_SUSPENDED; BR-LIC-01 exemptions)
 → PermissionsGuard (@RequirePermission vs cached permission set; perms_hash mismatch → 401 refresh)
 → AuthorityGuard (monetary limits where annotated — FR-USER-005.1)
 → SoDGuard (runtime segregation checks where annotated — BR-SEC-01)
 → Controller → Service (domain validation, approval_ref verification)
 → AuditInterceptor (mutation diff capture on response)
```

## 2.4 API key authentication (machine consumers) — FR-API-003

`Authorization: Bearer kfe_live_<26 chars>` → constant-time lookup by SHA-256 → checks: active, not expired, IP allowlist → scoped permission set replaces role resolution → same guards pipeline from PermissionsGuard down. Key management UI: create (secret shown once), scope picker, expiry, revoke (Redis cache bust ≤ 1 s), last-used.

## 2.5 M-Pesa callback authentication

Defense stack: dedicated Nginx location (no auth guard — Safaricom can't hold tokens) → strict rate zone → source IP allowlist (configurable, Safaricom ranges) → payload schema validation → shortcode must match a configured, enabled shortcode → `mpesa_ref` idempotency check → raw persist → process. B2C result URLs additionally carry a per-request `originator_conversation_id` correlation that must match a pending outbound record.

## 2.6 Licensing mutual authentication — FR-LIC-003

```
Super Admin Portal                        Instance /license/v1/*
  │  request signed with Infoney private key (JWS, kid)   │
  ├────────────────────────────────────────────────────────▶
  │            verify JWS against baked-in Infoney public keys
  │            verify audience = this school_id, exp ≤ 5 min, jti replay-cache
  │            execute enumerated handler (license schema only)
  │            response signed with INSTANCE private key
  ◀────────────────────────────────────────────────────────┤
  │  portal verifies instance signature (key registered at provisioning)
```

Both directions logged school-visibly (BR-LIC-04). Key rotation: dual-key overlap windows on both sides.

## 2.7 Session & token summary

| Artifact | Lifetime | Storage | Revocation |
|---|---|---|---|
| Access JWT | 15 min (5–60 config) | memory (web) / bearer (API) | implicit via sid check + perms_hash |
| Refresh token | 7 d (1–30 config) | httpOnly cookie | Session row revoke; family revoke on reuse |
| Pre-auth (2FA) token | 90 s | Redis | single-use |
| OTP | 5 min | Redis (hashed) | single-use, attempt-capped |
| API key | until expiry/revoke | hash in DB | immediate (cache bust) |
| Payslip link token | 72 h | signed JWT (payslip scope) | per-run invalidation |
| Password reset token | 30 min | hashed in DB | single-use; invalidates sessions on use |

---

*Continue to KFE-ARC-003 (Deployment & Infrastructure).*
