# KLICKIT FINANCE ERP — Phase 3

## System Architecture (Part 3 of 3): Deployment & Infrastructure Architecture

| Field | Value |
|---|---|
| **Document ID** | KFE-ARC-003 |
| **Version** | 1.0 |
| **Date** | 14 July 2026 |
| **Companions** | KFE-ARC-001, KFE-ARC-002 |

---

# 1. Deployment Topologies

One artifact set serves all three supported topologies (NFR-PORT-001):

| Topology | Description | TLS | M-Pesa callbacks |
|---|---|---|---|
| **T1 On-prem, internet-reachable** | School server with public IP / port-forward + domain | Let's Encrypt (certbot container) | Direct to instance |
| **T2 On-prem, LAN-only** | Server reachable only inside school network | School CA / self-signed (installer-generated, trust instructions) | Via Infoney callback relay* or manual-entry fallback |
| **T3 Cloud VPS** | School-owned VPS (any provider) | Let's Encrypt | Direct |

\* Callback relay (optional Infoney-hosted forwarder): registers as the Daraja callback URL and forwards payloads to the instance over an outbound-initiated tunnel. It sees only M-Pesa payloads (already visible to Safaricom), stores nothing, and is documented to schools (IR-020). Schools may decline and use Paybill statement import instead.

# 2. Container Architecture (Docker Compose)

```yaml
# docker-compose.yml — production shape (abridged; full file is a Phase 8 deliverable)
services:
  nginx:        # ingress: TLS, rate zones, static caching, request_id
    image: klickit/nginx:${KFE_VERSION}
    ports: ["80:80", "443:443"]
    depends_on: [api, web]
  web:          # Next.js standalone
    image: klickit/web:${KFE_VERSION}
  api:          # NestJS main.api — scale: 1..N replicas
    image: klickit/server:${KFE_VERSION}
    command: node dist/main.api.js
    deploy: { replicas: 2 }
  worker:       # NestJS main.worker — queues + cron
    image: klickit/server:${KFE_VERSION}
    command: node dist/main.worker.js
  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7 --appendonly yes
    volumes: [redisdata:/data]
  minio:
    image: minio/minio
    volumes: [miniodata:/data]
  backup:       # thin cron image invoking tools/backup (pg_dump+minio mirror+encrypt)
    image: klickit/ops:${KFE_VERSION}
  certbot:      # T1/T3 only (profile: public-tls)
    profiles: [public-tls]
networks:
  edge:     # nginx ⇄ web/api
  core:     # api/worker ⇄ postgres/redis/minio  (db/redis/minio NOT on edge)
volumes: { pgdata: {}, redisdata: {}, miniodata: {}, backups: {} }
```

Hardening defaults: all app containers non-root, read-only rootfs + tmpfs, `no-new-privileges`, resource limits per sizing tier, healthchecks on every service (compose `restart: unless-stopped` + healthcheck-gated dependencies), Postgres/Redis/MinIO never exposed on host ports (core network only).

## 2.1 Nginx layout

```
server 443:
  /                → web:3000            (Next.js; static assets cached 1y immutable)
  /api/v1/         → api upstream        (least_conn; proxy_read_timeout 60s)
  /ws/             → api upstream        (upgrade headers; sticky by ip_hash)
  /callbacks/      → api upstream        (strict rate zone; body limit 64k; IP allowlist include)
  /license/v1/     → api upstream        (separate rate zone; JWS auth at app layer)
  /minio-media/    → internal signed-URL redirect only (no direct MinIO exposure)
rate zones: auth 10r/m·IP  · api 300r/m·key  · callbacks 60r/m·IP  · general 100r/s burst
headers: HSTS(T1/T3) · CSP · XCTO · Referrer-Policy · Permissions-Policy · request_id
```

# 3. Environment & Configuration

Single `.env` (installer-generated, chmod 600) drives everything:

| Group | Keys (representative) |
|---|---|
| Core | `KFE_VERSION`, `SCHOOL_ID`, `BASE_URL`, `TZ=Africa/Nairobi`, `NODE_ENV` |
| Database | `DB_*` (app role: DML-only; `DB_MIGRATION_*` separate role — NFR-SEC-009) |
| Security | `JWT_KEY_CURRENT/PREVIOUS` (ES256 pems), `APP_ENCRYPTION_KEY` (AES-256 master, encrypts stored credentials), `SESSION_*` TTLs |
| Storage | `MINIO_*`, `BACKUP_PASSPHRASE` (schools told: lose this = backups unreadable) |
| Licensing | `INSTANCE_PRIVATE_KEY`, `LICENSE_FILE_PATH` |

Runtime-changeable settings (SMTP, SMS, M-Pesa, branding, policies) live in the DB via Settings module — `.env` is infrastructure-only, so schools almost never touch it after install.

**Environments:** `development` (compose.dev: hot-reload, mailhog, Daraja sandbox, seeded demo school) · `staging` (Infoney: full stack + integration sandboxes, target of CI E2E) · `production` (per school). Images are identical across staging/production; only config differs.

# 4. Installation & Upgrade Flows

## 4.1 Guided installer (NFR-PORT-002)

`install.sh` / `install.ps1`:

```
1 preflight  : CPU/RAM/disk/ports/docker/virtualization; fail with named fixes
2 gather     : school name, domain/IP, topology T1/T2/T3, admin email
3 generate   : .env (secrets via CSPRNG), TLS (certbot | self-signed+CA bundle)
4 pull & up  : compose pull → migrations (migration role) → seed (CoA, roles,
               permissions, templates, Infoney theme) → healthcheck gate
5 bootstrap  : create System Admin (forced 2FA + password change), license
               file import, print "first steps" checklist
6 smoke test : synthetic login + posting round-trip on seeded sandbox data
Target: ≤ 60 min end-to-end on baseline hardware, both OS targets.
```

## 4.2 Upgrade flow (FR-LIC-008)

```
update notice → System Admin schedules → upgrade script:
  compose pull (staged) → automatic pre-update backup (blocking; verified)
  → stop api/worker (web shows maintenance page via nginx fallback)
  → run migrations (transactional; abort = auto-restore instructions)
  → start new version → healthcheck + smoke → mark update applied (license API ack)
Rollback: restore pre-update backup + previous image tags (documented, scripted).
```

# 5. Sizing & Capacity Plan

| Tier | School size | Host | Replicas | Notes |
|---|---|---|---|---|
| S | ≤ 1,000 students | 4 vCPU / 8 GB / 100 GB SSD | api×1 | baseline (NFR envelope) |
| M | ≤ 4,000 | 8 vCPU / 16 GB / 250 GB SSD | api×2 | recommended default |
| L | ≤ 10,000 | 12 vCPU / 32 GB / 500 GB SSD | api×3, worker×2 | NFR-PERF-006 verified shape |

Postgres tuning per tier shipped as included conf files (shared_buffers 25% RAM, effective_cache_size 50%, WAL compression on). Disk watermarks alarm at 80/90% on `/ops`.

# 6. Backup, Recovery & DR Architecture

```
nightly 02:00  pg_dump -Fc  ─┐
               minio mirror ─┼─ tar → AES-256-GCM → SHA-256 manifest
               .env snapshot─┘        │
                          ┌───────────┼──────────────┐
                          ▼           ▼              ▼
                    local volume   MinIO bucket   optional offsite S3
                    (7 daily)      (4 weekly)     (12 monthly, school-chosen)
weekly: restore-verify into scratch container (row-count vs manifest, FR-BKP-003)
optional: WAL archiving → MinIO (RPO ≤ 15 min, NFR-AVL-004)
```

DR runbook (Phase 10 doc, architecture fixed here): host loss → new host → installer `--restore <archive>` → RTO ≤ 4 h; drill procedure included. Backup failure → email + notification + `/ops` red badge within 15 min.

# 7. Observability

| Concern | Mechanism |
|---|---|
| Logs | pino JSON → stdout → Docker json-file (rotate 100 MB×10) → optional shipping (Loki-compatible) — `request_id` correlated end-to-end |
| Metrics | `/metrics` (Prometheus format) on api/worker: HTTP latencies, queue depths, DLQ counts, posting throughput, integration failures — consumed by `/ops` page; optional school-side Prometheus/Grafana bundle (compose profile `monitoring`) |
| Alerts | In-app + email to System Admin: backup failure, DLQ growth, integrity sweep failure, disk watermark, cert expiry ≤ 14 d, license expiry ≤ 30 d, integration hard-down |
| Health | `/health` (liveness) + `/health/ready` (DB/Redis/MinIO probes) per container; Nginx maintenance fallback page when api down |
| Audit of ops | All installer/upgrade/restore runs append to a host-side ops journal |

# 8. Security Architecture Summary (deployment view)

- **Trust zones:** edge (nginx) → app (api/worker) → data (postgres/redis/minio, no ingress). Licensing calls terminate in the isolated module + `license` schema/role (ADR-002).
- **Secrets:** at rest in `.env` (600) + DB app-encrypted credentials; JWT/instance keys rotatable with overlap; backups encrypted independently.
- **Network:** UFW/Windows Firewall rules emitted by installer (only 80/443 + SSH/RDP admin-defined); fail2ban recipe for T1/T3 in hardening guide.
- **Supply chain:** images built in Infoney CI (SBOM + Trivy scan, NFR-SEC-006), signed (cosign), pinned by digest in compose; schools pull from Infoney registry over TLS.

# 9. Architecture Decision Record Index

| ADR | Decision | Doc |
|---|---|---|
| ADR-001 | Modular monolith over microservices | ARC-001 §2.1 |
| ADR-002 | Single DB; `license` schema + role isolation | ARC-001 §2.1 |
| ADR-003 | API/Worker split runtime from one codebase | ARC-001 §2.1 |
| ADR-004 | Next.js consumes public REST API only | ARC-001 §2.1 |
| ADR-005 | Transactional outbox for domain events | ARC-002 §1.3 |
| ADR-006 | Ports & adapters for all integrations | ARC-002 §1.5 |
| ADR-007 | ES256 JWT + rotating refresh, cookie transport for web | ARC-002 §2 |
| ADR-008 | Compose-first deployment; no Kubernetes requirement at school scale | ARC-003 §2 |
| ADR-009 | Callback relay as optional T2 accommodation | ARC-003 §1 |
| ADR-010 | Prometheus-format metrics + in-app ops page over external APM dependency | ARC-003 §7 |

---

**END OF PHASE 3 DELIVERABLES**

> **Phase gate:** Phase 3 awaits approval. Phase 4 will deliver the complete database design: full ERD, normalization analysis, indexes, constraints, relationships, naming conventions, and migration strategy — realizing ADR-002 and the entity models of KFE-FRD-001.
