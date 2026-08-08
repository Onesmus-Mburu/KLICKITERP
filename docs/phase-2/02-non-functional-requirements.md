# KLICKIT FINANCE ERP — Phase 2

## Non-Functional Requirements Elaboration

| Field | Value |
|---|---|
| **Document ID** | KFE-NFR-001 |
| **Version** | 1.0 |
| **Date** | 14 July 2026 |
| **Traces to** | KFE-SRS-001 §5 (NFR-*), §4 (IR-*) |

Each SRS NFR is elaborated with: design tactics (how the system meets it), measurement method, verification (which Phase 9 activity proves it), and pass criteria. Reference environment for all measurements: **baseline hardware** (4 vCPU / 8 GB / SSD), dataset **DS-M** (2,000 students, 3 years history ≈ 250k ledger rows), 50 concurrent users via k6 unless stated.

---

## 1. Performance (NFR-PERF-001…006)

| NFR | Design tactics | Measurement | Pass criteria |
|---|---|---|---|
| PERF-001 API latency | Indexed queries designed per access path (Phase 4); Redis caching of reference data (CoA, settings, permissions); no N+1 (dataloader/joins); connection pooling | k6 scenario `api-mixed` (70% read / 30% write), 50 VU, 10 min steady | Reads P95 ≤ 500 ms, writes P95 ≤ 1 s, error rate < 0.1% |
| PERF-002 Cashier flow | Trigram-indexed student search; allocation computed server-side in one round trip; receipt render client-side from posting response; print async | Scripted E2E (Playwright) timing lookup→post→render, 20 samples during PERF-001 load | ≤ 5 s end-to-end P95 on LAN |
| PERF-003 Dashboard | Materialized views (FR-DASH-010.1); route-level code splitting; TanStack Query cache; skeletons ≤ 100 ms | Lighthouse + Playwright nav timings, warm & cold | First render ≤ 3 s cold, ≤ 1.5 s warm navigations |
| PERF-004 Bulk billing | Chunked BullMQ jobs (100/batch), per-student txn, posting service batch mode; job workers separate container | Generate invoices for full DS-M (2,000 students) while `api-mixed` runs at 25 VU | ≤ 5 min total; interactive P95 ≤ 2× baseline during run |
| PERF-005 Reports | Server-side pagination; streaming exports; row-estimate gate → background path | Run report matrix at DS-M | ≤ 10 s interactive ≤ 10k rows; larger → job with progress |
| PERF-006 Headroom | Same tactics at dataset DS-L (10,000 students, 5 yr ≈ 2M ledger rows) on recommended hardware (8 vCPU/16 GB) | Repeat PERF-001/002/004 at DS-L | Same thresholds hold |

## 2. Scalability & Capacity (NFR-SCAL-001…003)

- **SCAL-001 History**: no hot-table archival dependency for correctness; reporting queries bounded by period indexes; verified by running the report matrix at DS-L with 10-year synthetic history (≈4M rows) — all reports complete (interactive ≤ 10 s or background).
- **SCAL-002 Horizontal scale**: stateless app containers (sessions in Redis, websockets via Redis pub/sub adapter, BullMQ workers idempotent); verified by 2-replica compose file passing the full E2E suite + PERF-001 at 100 VU.
- **SCAL-003 Storage**: MinIO single-node baseline; content-addressed object keys; verified with 500 GB synthetic corpus — upload/download P95 ≤ 3 s for 5 MB files.

## 3. Security (NFR-SEC-001…009)

| NFR | Design tactics | Verification |
|---|---|---|
| SEC-001 ASVS L2 | Security requirements checklist mapped to ASVS 4.0.3 L2 controls maintained from Phase 5; threat model per module (STRIDE-lite) | Phase 9 security test plan executes the ASVS checklist; external-style pentest script (OWASP ZAP baseline + authenticated scan) with zero high findings |
| SEC-002 Injection/XSS/CSRF | TypeORM parameterization only (lint rule bans raw string SQL); React auto-escaping + CSP `default-src 'self'`; SameSite=Strict cookies + CSRF token on cookie-auth mutations | ZAP active scan; manual payload suite per input class; CSP report-only burn-in then enforce |
| SEC-003 Encryption | TLS 1.2+/HSTS at Nginx; AES-256-GCM app-layer for credentials & backups; bcrypt cost 12; API keys SHA-256 | Config review + `testssl.sh` grade ≥ A; crypto unit tests with known vectors |
| SEC-004 Rate limits | Nginx zone limits + Nest throttler (Redis-backed): auth 10/min/IP, OTP 3/hr/phone, payment-init 30/min/user, general 300/min/key | k6 abuse scenarios expect 429 + `Retry-After` |
| SEC-005 Headers | Helmet + Nginx: CSP, XCTO, Referrer-Policy strict-origin, frame-ancestors 'none', Permissions-Policy minimal | securityheaders.com-equivalent scan grade A |
| SEC-006 Supply chain | `npm audit`/OSV + Trivy image scan in CI; lockfiles committed; Renovate cadence | CI gate: no critical/high CVEs at release tag |
| SEC-007 Uploads | MIME sniff + extension allowlist, 25 MB default cap, object storage (never web root), `Content-Disposition: attachment`, optional ClamAV sidecar hook | Upload abuse test suite (polyglot, oversized, double-extension) |
| SEC-008 Secrets | `.env` + docker secrets; JWT keys as rotatable keypairs (kid header); log scrubber middleware | Secret-scan CI (gitleaks); rotation drill documented + tested |
| SEC-009 Least privilege | Runtime DB role: DML on app schema only; migration role separate; containers non-root, read-only FS where possible | Deployment review checklist; automated check in installer preflight |

## 4. Availability & Reliability (NFR-AVL-001…005)

- **AVL-001 99.5%**: single-host tolerance via container auto-restart, healthchecks, and watchdog; measured by uptime monitoring over UAT month.
- **AVL-002 Fail-safe money**: all money paths in DB transactions with idempotency keys; M-Pesa callbacks idempotent on `mpesa_ref`; uncertain external results → explicit `PENDING_CONFIRMATION` states with operator queues, never silent success. **Chaos tests (Phase 9): kill app mid-receipt, kill DB mid-bulk-billing, replay callbacks ×5 — invariant checks (INT-002) must pass after each.**
- **AVL-003 Power loss**: PostgreSQL `synchronous_commit=on`, WAL fsync; BullMQ jobs idempotent + at-least-once; verified by hard-kill container tests with invariant sweep.
- **AVL-004 RPO/RTO**: nightly backups (RPO 24 h) + optional WAL archiving to MinIO (RPO ≤ 15 min); timed restore drill on baseline hardware must complete ≤ 4 h including verification.
- **AVL-005 Queue resilience**: retry/backoff/DLQ per FR-COMM-006.1; DLQ alarms; verified by provider-outage simulation (block egress, confirm queue-drain on restore).

## 5. Usability & Accessibility (NFR-USE-001…005)

- **USE-001**: task-analysis-driven cashier UI (keyboard map: F2 search, F4 method, F8 post — final map in Phase 6); usability test protocol with 5 representative users, ≥ 90% unassisted success on 6 core tasks after 30-min orientation.
- **USE-002 WCAG 2.1 AA**: axe-core in component CI + Playwright a11y sweep per screen + manual NVDA/VoiceOver script for payment capture, approvals, parent portal. Zero critical axe violations at release.
- **USE-003 i18n**: all strings via i18n keys (lint rule bans literals in JSX); ICU message format (plurals); `en` complete, `sw`, `fr` shipped; pseudo-locale build catches hardcoding.
- **USE-004/005**: confirmation-dialog design standard (consequence sentence + typed-confirm for irreversible); error copy review checklist; verified in UX audit pass.

## 6. Maintainability (NFR-MNT-001…006)

- **MNT-001/002**: Nx-style module boundaries with ESLint import rules (modules may only import their own + shared kernel); `tsconfig` strict; `noExplicitAny` at boundaries enforced by lint.
- **MNT-003 Coverage gates** (CI-enforced): global lines ≥ 80% on services; tagged critical suites (posting service, allocation, wallet debit, payroll compute, gapless numbering) ≥ 95% branch + property-based tests (fast-check) for allocation/rounding/statutory math.
- **MNT-004**: TypeORM migrations only; CI job runs `migration:run` + `migration:revert` on every PR against a scratch DB.
- **MNT-005 Logging**: pino JSON; `request_id` generated at Nginx, propagated through HTTP→service→BullMQ job→integration call; log levels runtime-switchable via /ops.
- **MNT-006**: semver; release pipeline produces images + migration bundle + upgrade notes template; downgrade notes mandatory for schema-changing releases.

## 7. Portability (NFR-PORT-001…003)

- Identical `docker-compose.yml` across Ubuntu/Windows Server; installer scripts (`install.sh` / `install.ps1`) run preflight (CPU/RAM/disk/ports/virtualization), generate `.env`, obtain/install TLS, create admin, run smoke test. **Acceptance: fresh install ≤ 60 min on both OS targets, executed as a Phase 9 test.**
- Host migration drill: backup on host A → restore on host B → invariant sweep + spot E2E — documented timing in the DR guide.

## 8. Data Integrity (NFR-INT-001…004)

- **INT-001**: posting service is the single GL write path (FR-ACC-001.1); DB triggers reject journal inserts from any other role as defense-in-depth.
- **INT-002 Invariant job** (hourly + on-demand): Σ student ledger = AR control; Σ supplier ledger = AP control; Σ wallets = wallet control; Σ inventory value = inventory control; Σ payroll payables = liability accounts; every journal balances; numbering series gap scan; audit hash chain verify. Any failure → CRITICAL alert + banner for System Admin; results retained.
- **INT-003 Gapless numbers**: per-series row-locked allocator inside the posting transaction; crash between allocate/commit rolls both back. Concurrency test: 200 parallel receipt posts → exactly 200 consecutive numbers.
- **INT-004 Rounding**: single shared `Money` library (decimal.js under the hood) — arithmetic outside it banned by lint in financial modules; documented rounding matrix (line-level half-up; PAYE per KRA rounding rules; statutory per gazette).

## 9. Interface NFRs (IR-001…032) — verification notes

- Responsive matrix tested at 360/768/1024/1440 px per screen in Playwright visual suite.
- Six UI states (IR-003) enforced by a shared `<QueryBoundary>` pattern — component checklist per screen in Phase 6 definitions of done.
- Thermal printing verified against ESC/POS emulator + at least one physical 80mm device class; barcode wedge tested with scanner-simulated input timing.
- Licensing surface (IR-027) gets a dedicated negative-test suite proving non-enumerated endpoints don't exist and usage payload matches FR-LIC-005.1 schema exactly.

---

*Verification activities named here become the skeleton of the Phase 9 test plan; each row traces back by NFR ID.*
