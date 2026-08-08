# KLICKIT FINANCE ERP

## Software Requirements Specification (SRS)

| Field | Value |
|---|---|
| **Document ID** | KFE-SRS-001 |
| **Version** | 1.0 (Draft for Approval) |
| **Date** | 14 July 2026 |
| **Product** | Klickit Finance ERP |
| **Owner** | Infoney Solutions Ltd |
| **Ecosystem** | Klickit Education (standalone deployment) |
| **Classification** | Confidential — Internal & Client Use |
| **Status** | Awaiting Phase 1 Approval |

---

## Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 0.1 | 14 Jul 2026 | Architecture Team | Initial full draft |
| 1.0 | 14 Jul 2026 | Architecture Team | Complete SRS submitted for approval |

---

# Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [System Features & Functional Requirements](#3-system-features--functional-requirements)
4. [External Interface Requirements](#4-external-interface-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Data Requirements](#6-data-requirements)
7. [Legal, Regulatory & Compliance Requirements](#7-legal-regulatory--compliance-requirements)
8. [Appendices](#8-appendices)

---

# 1. Introduction

## 1.1 Purpose

This Software Requirements Specification (SRS) defines the complete functional and non-functional requirements for **Klickit Finance ERP**, an enterprise-grade, standalone school financial management system developed by **Infoney Solutions Ltd** as part of the Klickit Education ecosystem.

This document is the authoritative baseline for:

- System architecture and detailed design (Phases 3–4)
- Backend and frontend implementation (Phases 5–6)
- API documentation (Phase 7)
- Deployment engineering (Phase 8)
- Test planning and acceptance (Phase 9)
- Technical and user documentation (Phase 10)

Every requirement herein is uniquely identified and traceable through subsequent phases.

## 1.2 Document Conventions

| Convention | Meaning |
|---|---|
| **SHALL** | Mandatory requirement. Non-negotiable for production release. |
| **SHOULD** | Strongly recommended; deviation requires documented justification. |
| **MAY** | Optional or configurable capability. |
| `FR-<MOD>-###` | Functional requirement ID, scoped per module (e.g., `FR-BILL-012`). |
| `NFR-<CAT>-###` | Non-functional requirement ID, scoped per category (e.g., `NFR-SEC-004`). |
| `IR-###` | Interface requirement ID. |
| `DR-###` | Data requirement ID. |
| `CR-###` | Compliance requirement ID. |

Priority classification used throughout:

- **P1 (Critical)** — System is not shippable without it.
- **P2 (High)** — Required for production; may be enabled per school configuration.
- **P3 (Standard)** — Full-feature requirement; part of complete scope (no feature is dropped — priority governs build order only).

## 1.3 Intended Audience

| Audience | Usage |
|---|---|
| Infoney Solutions engineering team | Design, build, test the system |
| Infoney Solutions QA | Derive test plans and acceptance tests |
| Infoney Solutions DevOps | Deployment and infrastructure planning |
| School stakeholders (Directors, Bursars, Accountants) | Validate business scope |
| Klickit Education Super Admin operations | Licensing and instance lifecycle scope |
| Auditors / compliance reviewers | Regulatory conformance |

## 1.4 Product Scope

Klickit Finance ERP is a **complete financial management platform for educational institutions**: primary schools, junior schools, secondary schools, colleges, and (future-ready) universities.

The system covers, end to end:

1. **Student Finance** — fee categories, fee structures, billing (single, bulk, recurring), invoicing, waivers, discounts, scholarships, bursaries, installments, credit/debit notes, refunds, statements, defaulter management, aging.
2. **Fee Collection** — cash, bank, cheque, card, POS, M-Pesa (STK Push, Paybill, Till), bank transfer, student wallet; split/partial/advance/bulk payments; receipting via print, email, SMS, and push.
3. **Student E-Wallet** — top-ups, transfers, refunds, locks/freezes, ledgers, statements, spend controls, limits, approval workflows; spending across transport, library, shop, meals, printing, trips, activities, and emergencies.
4. **Procurement** — suppliers, vendor management, requisitions, purchase orders, quotation comparison, GRNs, supplier payments and statements, contracts, supplier rating.
5. **Inventory** — stock, stores, uniforms, books, consumables, barcode/QR support, stock movement, valuation, reorder levels.
6. **Expense Management** — categories, petty cash, claims, approvals, recurring expenses, attachments, budget tracking.
7. **Payroll** — employees, salary structures, allowances, deductions, Kenyan statutory computations (PAYE, NSSF, SHA/NHIF, Housing Levy), loans, advances, overtime, leave deductions, processing, payslips, journals, reports.
8. **Banking** — bank/cash accounts, transfers, deposits, withdrawals, reconciliation, statement import, cheque register.
9. **Accounting** — full double-entry general ledger, chart of accounts, journals, opening balances, period/year close, trial balance, financial statements, budgets, ratios, audit reports.
10. **Fixed Assets** — register, depreciation, maintenance, transfers, disposals, insurance, barcode tracking.
11. **Reporting** — the complete report catalogue with export to PDF, Excel, CSV, and print.
12. **Communications** — notification center; SMS, email, push, WhatsApp-ready; event-driven triggers and custom notifications.
13. **Approval Workflows** — configurable multi-level approval chains across finance operations.
14. **User Management & Security** — RBAC, permissions, departments, audit logs, 2FA, session management, password policies, IP restrictions.
15. **Settings, Branding & System Configuration** — full white-labeling per school on top of the default Infoney Solutions brand identity.
16. **Integrations** — M-Pesa, QuickBooks, Xero, Sage, bank APIs, Firebase, SMTP, SMS gateways, REST APIs, webhooks.
17. **Licensing interface** — a constrained API surface consumed by the Klickit Education Super Admin Portal for subscription lifecycle only.

### 1.4.1 Out of Scope (this product)

- Academic management (timetables, exams, grading, admissions academics) — handled by other Klickit Education products.
- Cross-school data aggregation or shared databases of any kind.
- Super Admin access to any school financial data (explicitly prohibited — see §3.20).
- Learning management, transport routing logic, or HR functions beyond payroll-relevant employee data.

## 1.5 Definitions, Acronyms & Abbreviations

| Term | Definition |
|---|---|
| **Instance** | One complete, isolated deployment of Klickit Finance ERP owned by one school. |
| **Tenant** | A school. One tenant per instance (single-tenant architecture, per-school hosting). |
| **Bursar** | The school's chief finance officer role. |
| **Term** | An academic period within an academic year (e.g., Term 1/2/3 or Semester 1/2). |
| **Fee Structure** | The set of fee items applicable to a class/grade/stream for a term or year. |
| **Invoice** | A financial demand issued to a student account for fees or charges. |
| **Receipt** | Proof of payment applied against a student account, invoice, or wallet. |
| **GRN** | Goods Received Note. |
| **LPO / PO** | (Local) Purchase Order. |
| **STK Push** | Safaricom M-Pesa SIM Toolkit push payment prompt (Lipa Na M-Pesa Online). |
| **C2B / B2C** | M-Pesa Customer-to-Business / Business-to-Customer API flows. |
| **PAYE** | Pay As You Earn income tax (Kenya Revenue Authority). |
| **NSSF** | National Social Security Fund. |
| **SHA / SHIF** | Social Health Authority / Social Health Insurance Fund (successor to NHIF). |
| **AHL** | Affordable Housing Levy. |
| **CoA** | Chart of Accounts. |
| **GL** | General Ledger. |
| **RBAC** | Role-Based Access Control. |
| **2FA** | Two-Factor Authentication. |
| **KPI** | Key Performance Indicator. |
| **DR** | Disaster Recovery. |
| **eTIMS** | KRA electronic Tax Invoice Management System. |

## 1.6 References

1. Infoney Solutions Brand Identity Guidelines (fonts, palette — see §3.17).
2. Safaricom Daraja API documentation (M-Pesa Express/STK, C2B, B2C, Transaction Status, Reversal).
3. KRA PAYE tax bands and reliefs (current gazetted rates, configurable).
4. NSSF Act tier structure; SHA/SHIF contribution rates; Affordable Housing Levy Act rates.
5. Kenya Data Protection Act, 2019.
6. IFRS for SMEs / IPSAS (as applicable to institutional accounting presentation).
7. WCAG 2.1 AA accessibility guidelines.
8. OWASP Application Security Verification Standard (ASVS) 4.x.
9. OpenAPI Specification 3.1.

## 1.7 Document Overview

Section 2 describes the product context, users, constraints, and deployment model. Section 3 enumerates functional requirements per module. Section 4 defines external interfaces. Section 5 defines non-functional requirements. Sections 6–7 cover data and compliance. Section 8 contains appendices, including the traceability scheme and future scope.

---

# 2. Overall Description

## 2.1 Product Perspective

Klickit Finance ERP is a **standalone, self-contained product**. It is a member of the Klickit Education ecosystem by brand and by a narrow licensing API — not by shared infrastructure.

```
┌────────────────────────────────────────────────────────────────────┐
│                    KLICKIT EDUCATION ECOSYSTEM                     │
│                                                                    │
│   ┌──────────────────────────┐                                     │
│   │  Super Admin Portal      │   Licensing / lifecycle API ONLY    │
│   │  (Infoney Solutions)     │◄───────────────┐                    │
│   └──────────────────────────┘                │                    │
│                                               │                    │
│  ┌────────────────┐  ┌────────────────┐  ┌────┴───────────┐        │
│  │ School A       │  │ School B       │  │ School N       │        │
│  │ Instance       │  │ Instance       │  │ Instance       │        │
│  │ ┌────────────┐ │  │ ┌────────────┐ │  │ ┌────────────┐ │        │
│  │ │ App + API  │ │  │ │ App + API  │ │  │ │ App + API  │ │        │
│  │ │ PostgreSQL │ │  │ │ PostgreSQL │ │  │ │ PostgreSQL │ │        │
│  │ │ Redis      │ │  │ │ Redis      │ │  │ │ Redis      │ │        │
│  │ │ MinIO      │ │  │ │ MinIO      │ │  │ │ MinIO      │ │        │
│  │ │ Backups    │ │  │ │ Backups    │ │  │ │ Backups    │ │        │
│  │ └────────────┘ │  │ └────────────┘ │  │ └────────────┘ │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
│      NO school-to-school connectivity. NO shared data. EVER.       │
└────────────────────────────────────────────────────────────────────┘
```

Key architectural positions established at requirements level:

- **Single-tenant per instance.** Each school hosts its own installation. Each school owns its database, files, users, financial records, integrations, backups, and branding in full.
- **Complete tenant isolation.** There is no shared database, no shared file store, no shared user directory, and no data path between schools.
- **Super Admin is licensing-only.** The Super Admin Portal communicates with each instance exclusively through a versioned, authenticated licensing API. It **cannot** read, query, export, or infer any financial data (§3.20).
- **Offline-tolerant on-premise or cloud.** An instance may run on a school's Windows Server or Ubuntu server on the LAN, or on a VPS/cloud host — with identical functionality.

## 2.2 Business & Deployment Model

| Aspect | Model |
|---|---|
| Licensing | Subscription per school, managed via Super Admin Portal |
| Hosting | Per-school: on-premise (Windows Server / Ubuntu) or cloud VPS |
| Data ownership | 100% school-owned, including backups |
| Updates | Pushed/announced by Infoney via the licensing channel; applied per instance |
| Branding | Infoney defaults; fully re-brandable per school |
| Support boundary | Infoney supports the software; the school owns its data and infrastructure choices |

License states an instance can occupy: `PROVISIONED → ACTIVE → GRACE → SUSPENDED → DEACTIVATED`, plus `EXPIRED` (subscription lapse) and renewal transitions. Behavior in each state is specified in §3.20.

## 2.3 Product Functions (Summary)

The module map (each is fully specified in §3):

| # | Module | Code |
|---|---|---|
| 1 | Authentication, Users, RBAC & Security Administration | AUTH / USER |
| 2 | Executive & Operational Dashboards | DASH |
| 3 | Student Financial Records & Billing | BILL |
| 4 | Fee Collection & Receipting | PAY |
| 5 | Student E-Wallet | WALL |
| 6 | Procurement | PROC |
| 7 | Inventory & Stores | INV |
| 8 | Expense Management & Petty Cash | EXP |
| 9 | Payroll | PYRL |
| 10 | Banking & Cash Management | BANK |
| 11 | Accounting & General Ledger | ACC |
| 12 | Fixed Assets | FA |
| 13 | Reports & Analytics | RPT |
| 14 | Communications & Notification Center | COMM |
| 15 | Approval Workflows | APPR |
| 16 | Settings & System Configuration | SET |
| 17 | Branding & White-Labeling | BRND |
| 18 | Integrations | INTG |
| 19 | Public API Layer | API |
| 20 | Licensing & Super Admin Interface | LIC |
| 21 | Audit, Backup & Restore | AUD / BKP |

## 2.4 User Classes and Characteristics

| User Class | Description | Typical Access | Technical Level |
|---|---|---|---|
| **School Director / Principal** | Executive oversight; approvals; dashboards; reports | Read-heavy + high-value approvals | Low–Medium |
| **Bursar / Finance Manager** | Owns the finance function end to end | Full finance modules | Medium |
| **Accountant** | GL, journals, reconciliation, statements, period close | Accounting, banking, reports | Medium–High |
| **Cashier / Fee Clerk** | Collects payments, issues receipts, handles counter operations | Fee collection, receipting, wallet top-ups | Low–Medium |
| **Billing Officer** | Fee structures, invoicing, waivers, statements | Student finance | Medium |
| **Procurement Officer** | Requisitions, POs, GRNs, suppliers | Procurement, inventory | Medium |
| **Storekeeper** | Stock receipt, issue, counts | Inventory | Low |
| **HR / Payroll Officer** | Employee pay data, payroll runs | Payroll | Medium |
| **System Administrator (school)** | Users, roles, settings, branding, backups, integrations | Administration modules | High |
| **Auditor (read-only)** | Internal/external audit review | Read-only + audit trails | Medium–High |
| **Parent / Guardian** | Views statements, invoices, receipts; tops up wallet; pays fees | Parent portal (own children only) | Low |
| **Student** | Views own wallet balance/spend (age-appropriate, configurable) | Wallet view (optional) | Low |
| **POS Operator** (canteen, shop, library, transport) | Charges student wallets at service points | Wallet POS endpoints | Low |
| **Super Admin (Infoney)** | Licensing lifecycle only — no financial data access | Licensing API only | High |
| **API Consumer (machine)** | Approved third-party systems via API keys | Scoped API access | N/A |

Characteristics that materially shape requirements:

- Many operators work in **low-bandwidth, intermittent-connectivity environments** (rural African schools). The LAN-hosted deployment must be fully functional without internet, except for external integrations (M-Pesa, SMS, email), which must queue and retry.
- Cashiers process **high-volume, short transactions** during peak periods (term opening). Counter workflows must be keyboard-fast, ≤3 interactions to receipt a standard payment.
- Parents interact primarily via **mobile devices and M-Pesa**.

## 2.5 Operating Environment

| Layer | Environment |
|---|---|
| Server OS | Ubuntu Server LTS (22.04/24.04) **and** Windows Server 2019/2022 (via Docker Desktop or native Docker) |
| Runtime | Docker + Docker Compose; Node.js LTS inside containers |
| Database | PostgreSQL 16+ |
| Cache/Queues | Redis 7+ (cache, sessions, BullMQ queues) |
| Object storage | MinIO (S3-compatible, local) + local filesystem fallback |
| Reverse proxy | Nginx with TLS (Let's Encrypt or school-provided certs; self-signed supported for LAN) |
| Client | Evergreen browsers (Chrome, Edge, Firefox, Safari), desktop and mobile; minimum viewport 360px |
| Email | Local SMTP relay or school-configured external SMTP |
| Hardware baseline (school server) | 4 vCPU, 8 GB RAM, 100 GB SSD minimum; recommended 8 vCPU, 16 GB RAM, 250 GB SSD |
| Peripherals | 80mm thermal receipt printers, A4 printers, barcode/QR scanners (HID), cash drawers (via printer kick), POS card terminals (standalone reconciliation) |

## 2.6 Design and Implementation Constraints

1. **Mandated stack** (non-negotiable): NestJS + TypeScript + TypeORM + PostgreSQL + Redis + BullMQ backend; Next.js (App Router) + React + TypeScript + TailwindCSS + TanStack Query + React Hook Form + Zod + shadcn/ui + Framer Motion + Recharts frontend; Docker/Nginx infrastructure; Swagger/OpenAPI; JWT + Passport auth; WebSockets for real-time.
2. **Double-entry accounting is foundational.** Every financial event in every module SHALL produce balanced GL postings. No module may write financial figures outside the ledger pipeline.
3. **Monetary values** SHALL be stored as exact decimal types (`NUMERIC(18,4)` storage, 2-dp presentation by default) — never floating point.
4. **All financially significant records are immutable**: invoices, receipts, journals, and payslips are never hard-deleted or edited after posting; corrections occur through reversing/adjusting documents (credit notes, reversal journals).
5. **Single-tenant deployment** — no multi-tenant shortcuts (no `tenant_id` sharding logic); isolation is physical.
6. **Default branding** must implement the Infoney Solutions identity (Poppins; Deep Purple #573399 primary; full palette in §3.17) with runtime re-branding per school.
7. The system must run **fully featured without internet access**, degrading only external integrations to queued/retry mode.
8. All timestamps stored in UTC; displayed in the school-configured timezone (default Africa/Nairobi).

## 2.7 Assumptions and Dependencies

| # | Assumption / Dependency | Risk if invalid |
|---|---|---|
| A1 | Schools can provision a server meeting the hardware baseline (or a VPS) | Undersized hosts degrade performance; installer SHALL run a preflight check |
| A2 | M-Pesa integrations require school-owned Daraja credentials (Paybill/Till) | Without them, M-Pesa channels are disabled per configuration; manual entry remains |
| A3 | SMS/email delivery depends on school-configured gateway credentials | Notifications queue and surface delivery failures |
| A4 | Statutory rates (PAYE bands, NSSF, SHA, AHL) change by gazette | Rates are versioned, effective-dated configuration — never hardcoded |
| A5 | Student bio-data may originate in another Klickit product | Import interfaces (CSV/Excel/API) provided; the ERP maintains its own student financial registry |
| A6 | Licensing API requires periodic outbound connectivity | Grace-period logic (§3.20) tolerates extended offline windows |

---

# 3. System Features & Functional Requirements

> Every requirement is testable and carries an ID. Priorities: P1 Critical, P2 High, P3 Standard. All are in scope for the production system.

## 3.1 Authentication, User Management & Security Administration (AUTH / USER)

### 3.1.1 Authentication

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-001 | The system SHALL authenticate users with username/email + password, issuing a short-lived JWT access token and a rotating refresh token. | P1 |
| FR-AUTH-002 | Refresh tokens SHALL be single-use, rotated on refresh, revocable, and bound to a device/session record. | P1 |
| FR-AUTH-003 | Passwords SHALL be hashed with bcrypt (configurable cost ≥ 12); plaintext passwords SHALL never be stored or logged. | P1 |
| FR-AUTH-004 | The system SHALL support TOTP-based 2FA (authenticator apps) per user, enforceable per role by policy. | P1 |
| FR-AUTH-005 | The system SHALL support 2FA recovery codes (one-time use, hashed at rest, regenerable by the user). | P2 |
| FR-AUTH-006 | The system SHALL enforce configurable password policy: min length, complexity classes, history (reuse prevention), max age, and first-login forced change. | P1 |
| FR-AUTH-007 | The system SHALL lock an account after N failed attempts (configurable, default 5) for a configurable duration, with admin unlock and audit entry. | P1 |
| FR-AUTH-008 | The system SHALL provide secure password reset via time-limited, single-use email token; reset events SHALL invalidate active sessions. | P1 |
| FR-AUTH-009 | The system SHALL maintain a session registry per user (device, IP, user agent, last activity) with per-session and global revocation ("log out everywhere"). | P1 |
| FR-AUTH-010 | The system SHALL support configurable idle timeout and absolute session lifetime per role. | P2 |
| FR-AUTH-011 | The system SHALL support IP allowlist restrictions per role and/or per user (e.g., cashier accounts usable only from school LAN ranges). | P2 |
| FR-AUTH-012 | The system SHALL record login history (success and failure) with timestamp, IP, device fingerprint, and geolocation where derivable, retained per audit retention policy. | P1 |
| FR-AUTH-013 | Parent portal authentication SHALL support phone-number-based login with OTP (SMS) as an alternative to email/password. | P2 |
| FR-AUTH-014 | The system SHALL rate-limit authentication endpoints and OTP issuance to prevent brute force and SMS-flooding abuse. | P1 |

### 3.1.2 Users, Roles & Permissions (RBAC)

| ID | Requirement | Priority |
|---|---|---|
| FR-USER-001 | The system SHALL implement RBAC with fine-grained permissions of the form `module:resource:action` (e.g., `billing:invoice:void`). | P1 |
| FR-USER-002 | The system SHALL ship with predefined system roles (Director, Bursar, Accountant, Cashier, Billing Officer, Procurement Officer, Storekeeper, Payroll Officer, System Admin, Auditor, Parent, POS Operator) whose permission sets are editable copies — system role templates themselves are immutable. | P1 |
| FR-USER-003 | Administrators SHALL be able to create custom roles composed of any permission set, and assign multiple roles per user (union of permissions, deny-overrides where explicitly configured). | P1 |
| FR-USER-004 | The system SHALL support organizational departments; users belong to departments; approval routing and report filters MAY use department scope. | P2 |
| FR-USER-005 | The system SHALL support monetary authority limits per user/role (e.g., a cashier may not receipt above X without supervisor override; an approver level covers amounts up to Y). | P1 |
| FR-USER-006 | The Auditor role SHALL be read-only across all financial modules, including full audit-log access, with the system preventing any write grant to it. | P1 |
| FR-USER-007 | User lifecycle SHALL support: invite/create, activate, suspend, deactivate (never delete — deactivated users retain historical attribution). | P1 |
| FR-USER-008 | Every permission check failure SHALL render a purposeful "no access" state in the UI (never a blank screen or raw error). | P2 |
| FR-USER-009 | Segregation-of-duties rules SHALL be configurable and enforced (e.g., the same user may not both create and approve a payment voucher; may not both run and approve payroll). | P1 |
| FR-USER-010 | Parent accounts SHALL be linked to one or more students (guardianship), and SHALL only ever see data for their linked students. | P1 |

### 3.1.3 Audit Logging

| ID | Requirement | Priority |
|---|---|---|
| FR-AUD-001 | The system SHALL write an immutable, append-only audit log entry for every create/update/delete/approve/void/post action on financial and administrative entities, capturing: actor, timestamp (UTC), entity, entity ID, action, before/after diff, IP, and session ID. | P1 |
| FR-AUD-002 | Audit logs SHALL be tamper-evident (hash-chained records) and excluded from any user-facing delete capability. | P1 |
| FR-AUD-003 | The system SHALL provide searchable/filterable audit views (by user, entity, module, date range, action) with export, restricted to authorized roles. | P1 |
| FR-AUD-004 | Sensitive reads (e.g., payroll data, full audit exports) SHALL themselves be audit-logged as access events. | P2 |

## 3.2 Dashboard (DASH)

| ID | Requirement | Priority |
|---|---|---|
| FR-DASH-001 | The system SHALL provide an Executive Dashboard as the default landing page, permission-filtered so each user sees only widgets their role permits. | P1 |
| FR-DASH-002 | The dashboard SHALL display, for the active academic period: Today's Collection, Outstanding Fees, Collection Rate (%), Cash Flow position, Revenue, Expenses, and Profit/Surplus — each as a KPI tile with period comparison (vs. previous day/term as appropriate). | P1 |
| FR-DASH-003 | The dashboard SHALL display invoice status summary (issued, paid, partially paid, overdue counts and values). | P1 |
| FR-DASH-004 | The dashboard SHALL display payroll status (last run, next run, gross/net totals) to authorized roles. | P2 |
| FR-DASH-005 | The dashboard SHALL display total Wallet Balance (aggregate student wallet liability) and per-account Bank/Cash Balances. | P1 |
| FR-DASH-006 | The dashboard SHALL render a Collection Trend chart (daily/weekly/monthly/termly granularity) and an Income vs Expense comparison chart, using Recharts, with drill-through to underlying reports. | P1 |
| FR-DASH-007 | The dashboard SHALL provide Quick Actions (new payment, new invoice, wallet top-up, new expense, new student) filtered by permission. | P2 |
| FR-DASH-008 | The dashboard SHALL surface the notification center (unread counts, latest items) and pending approvals awaiting the current user. | P1 |
| FR-DASH-009 | KPI figures SHALL update in near-real-time (WebSocket push or ≤60s refresh) without full page reload. | P2 |
| FR-DASH-010 | All dashboard aggregates SHALL be computed from the ledger/source-of-truth tables (or materialized views refreshed from them) — never from parallel counters that can drift. | P1 |
| FR-DASH-011 | The dashboard SHALL support date-range and academic-period selectors that re-scope every widget consistently. | P2 |
| FR-DASH-012 | The dashboard SHALL degrade gracefully: each widget carries independent loading, error, and empty states; one failed widget SHALL NOT break the page. | P2 |

## 3.3 Student Finance — Billing (BILL)

### 3.3.1 Student Financial Registry

| ID | Requirement | Priority |
|---|---|---|
| FR-BILL-001 | The system SHALL maintain a student financial registry: admission number (unique), names, class/grade, stream, status (active, alumni, transferred, suspended, withdrawn), guardians and contacts, and financial attributes (fee group, sponsor, transport route, boarding status, custom fields). | P1 |
| FR-BILL-002 | The system SHALL support student import via CSV/Excel with validation preview, error reporting per row, and idempotent re-import; and via REST API. | P1 |
| FR-BILL-003 | Each student SHALL have exactly one student ledger account (sub-ledger of Accounts Receivable) recording every charge, payment, waiver, and adjustment chronologically with running balance. | P1 |
| FR-BILL-004 | The system SHALL support sibling linkage under a common guardian for consolidated parent statements and family-level payment allocation. | P2 |
| FR-BILL-005 | The system SHALL support student promotion/rollover between academic years (bulk class progression) carrying forward balances. | P1 |

### 3.3.2 Fee Categories & Structures

| ID | Requirement | Priority |
|---|---|---|
| FR-BILL-010 | The system SHALL support unlimited fee categories (tuition, boarding, transport, meals, activity, exam, uniform, development, etc.), each mapped to a GL income account and optional tax treatment. | P1 |
| FR-BILL-011 | The system SHALL support fee structures defined per academic year + term + class/grade (+ optional stream, boarding status, fee group), composed of fee items with amounts. | P1 |
| FR-BILL-012 | Fee structures SHALL support versioning: published structures are locked; amendments create a new version with effective dating and an audit trail. | P1 |
| FR-BILL-013 | The system SHALL support optional/elective fee items assignable per student (e.g., transport by route with route-based pricing, music lessons). | P1 |
| FR-BILL-014 | The system SHALL support one-off ad-hoc charges to any student with reason, category, and GL mapping. | P1 |
| FR-BILL-015 | Fee structures SHALL be copyable across terms/years with bulk percentage or absolute adjustments. | P2 |

### 3.3.3 Invoicing

| ID | Requirement | Priority |
|---|---|---|
| FR-BILL-020 | The system SHALL generate invoices per student from applicable fee structures — individually, or in bulk by class/stream/fee group/whole school — with a pre-generation preview (count, total, exceptions). | P1 |
| FR-BILL-021 | Bulk billing SHALL run as a background job (BullMQ) with progress reporting, per-student error isolation (one failure never aborts the batch), and a post-run summary report. | P1 |
| FR-BILL-022 | The system SHALL support recurring billing schedules (per term auto-billing at configurable lead time before term start) with approval gate before posting. | P2 |
| FR-BILL-023 | Invoices SHALL carry: sequential tamper-proof numbering (configurable format, gapless per series), issue date, due date, line items with categories, discounts, tax where applicable, totals, balance brought forward, and school branding. | P1 |
| FR-BILL-024 | Invoice numbering SHALL be gapless and strictly sequential per numbering series; voided invoices retain their number with VOID status. | P1 |
| FR-BILL-025 | The system SHALL support installment plans per invoice or per student (schedule of due dates and amounts), with per-installment due tracking and reminders. | P1 |
| FR-BILL-026 | The system SHALL support configurable late fees and/or interest on overdue balances: flat, percentage, or tiered; applied automatically by scheduled job with per-student exemption flags and approval-gated bulk application. | P2 |
| FR-BILL-027 | Posted invoices SHALL be immutable; corrections SHALL occur only via credit notes (reductions) or debit notes (additions), each approval-gated per workflow configuration. | P1 |
| FR-BILL-028 | Invoice templates SHALL be configurable (layout, columns, branding, footer notes, digital signature, watermark) with live preview (see BRND). | P2 |
| FR-BILL-029 | The system SHALL email/SMS/push invoices to guardians upon issue per communication settings, with per-guardian channel preferences. | P1 |
| FR-BILL-030 | Voiding an invoice SHALL require permission + reason, reverse its GL postings by system-generated reversal, and be blocked if payments are applied (credit note path required instead). | P1 |

### 3.3.4 Waivers, Discounts, Scholarships & Bursaries

| ID | Requirement | Priority |
|---|---|---|
| FR-BILL-040 | The system SHALL support fee waivers (full/partial, per fee item or invoice) with mandatory reason, supporting documents, and approval workflow before posting. | P1 |
| FR-BILL-041 | The system SHALL support discount schemes: sibling discounts, early-payment discounts, staff-child discounts, and custom schemes — rule-based (percentage/fixed, per category), applied automatically at billing or manually with approval. | P1 |
| FR-BILL-042 | The system SHALL manage scholarships and bursaries as sponsor-funded instruments: sponsor registry, award amounts per student per term, automatic application against invoices, sponsor utilization statements, and unspent balance handling. | P1 |
| FR-BILL-043 | All concessions (waivers/discounts/scholarships/bursaries) SHALL post to distinct GL accounts so gross billing, concessions, and net revenue are independently reportable. | P1 |

### 3.3.5 Credit Notes, Debit Notes & Refunds

| ID | Requirement | Priority |
|---|---|---|
| FR-BILL-050 | The system SHALL support credit notes referencing an invoice (full/partial, line-level), sequentially numbered, approval-gated, with automatic GL reversal postings. | P1 |
| FR-BILL-051 | The system SHALL support debit notes for additional charges referencing a student account, sequentially numbered, with GL postings. | P1 |
| FR-BILL-052 | The system SHALL support refunds of credit balances (overpayment, withdrawal clearance) via cash, bank transfer, M-Pesa B2C, or wallet credit — approval-gated with configurable thresholds, fully receipted and GL-posted. | P1 |

### 3.3.6 Statements, Defaulters & Aging

| ID | Requirement | Priority |
|---|---|---|
| FR-BILL-060 | The system SHALL produce student statements (chronological ledger: opening balance, charges, payments, adjustments, running balance) for any date range, exportable to PDF and shareable via email/SMS link. | P1 |
| FR-BILL-061 | The system SHALL produce consolidated parent/guardian statements across all linked students. | P1 |
| FR-BILL-062 | The system SHALL provide a defaulters register filterable by class, amount threshold, days overdue, and fee category, with bulk-action support (send reminders, print lists, export). | P1 |
| FR-BILL-063 | The system SHALL provide receivables aging analysis (current, 1–30, 31–60, 61–90, 90+ days — bucket boundaries configurable) at student, class, and school level. | P1 |
| FR-BILL-064 | The system SHALL send automated invoice reminders at configurable offsets (before due, on due, after due — escalating cadence) via SMS/email/push, with per-student opt-out and full send logs. | P1 |
| FR-BILL-065 | The system SHALL track outstanding balances in real time at student, class, stream, and school levels, consistent with the GL receivables control account at all times. | P1 |

## 3.4 Fee Collection & Receipting (PAY)

### 3.4.1 Payment Capture

| ID | Requirement | Priority |
|---|---|---|
| FR-PAY-001 | The system SHALL accept payments via: Cash, Bank deposit/transfer, Cheque, Card, POS terminal (reference capture), M-Pesa STK Push, M-Pesa Paybill (C2B confirmation), M-Pesa Till, and Student Wallet — each method individually enable/disable-able in settings. | P1 |
| FR-PAY-002 | The cashier payment screen SHALL locate a student by admission number, name, or guardian phone in ≤2 seconds and display current balance and open invoices before capture. | P1 |
| FR-PAY-003 | The system SHALL support partial payments against any invoice and split payments (one receipt settled by multiple methods, e.g., cash + M-Pesa). | P1 |
| FR-PAY-004 | The system SHALL support advance payments (prepayments) held as student credit and auto-applied to future invoices per allocation rules. | P1 |
| FR-PAY-005 | Payment allocation SHALL default to configurable rules (oldest-invoice-first, or category priority order, e.g., tuition before activity) with manual reallocation permission-gated and audit-logged. | P1 |
| FR-PAY-006 | The system SHALL support bulk payment capture: bank statement / sponsor cheque covering many students, allocated via an allocation worksheet (manual or CSV-driven) producing individual receipts. | P1 |
| FR-PAY-007 | Cheque payments SHALL be captured with bank, cheque number, and date; carried as "uncleared" until marked cleared/bounced; a bounced cheque SHALL auto-reverse the receipt, restore the balance, optionally apply a bounce fee, and notify the guardian. | P1 |
| FR-PAY-008 | M-Pesa STK Push SHALL be initiable from the cashier screen and from the parent portal: enter/confirm phone + amount → push → automatic confirmation via callback → automatic receipt. | P1 |
| FR-PAY-009 | M-Pesa Paybill/Till C2B confirmations SHALL auto-match to students by account reference (admission number pattern); unmatched payments SHALL enter a suspense queue for manual matching with full audit trail — funds are never lost or silently dropped. | P1 |
| FR-PAY-010 | The system SHALL prevent duplicate processing of the same M-Pesa transaction ID (idempotent callback handling). | P1 |
| FR-PAY-011 | Cashier sessions SHALL be supported: session open (float declaration) → collections → session close (denomination count, variance computation, supervisor sign-off) with a session report. | P1 |
| FR-PAY-012 | Payment reversal/void SHALL be approval-gated with mandatory reason, generate reversing GL entries and a reversal receipt reference, and never delete the original record. | P1 |

### 3.4.2 Receipting

| ID | Requirement | Priority |
|---|---|---|
| FR-PAY-020 | Every payment SHALL generate a sequentially numbered, gapless, immutable receipt (per numbering series) showing payer, student, method(s), allocation detail, amounts, balance after payment, cashier, and branding. | P1 |
| FR-PAY-021 | Receipts SHALL print to 80mm thermal and A4 formats, with reprint permission-controlled and reprints watermarked "REPRINT" with count. | P1 |
| FR-PAY-022 | Receipts SHALL be delivered automatically via email (PDF), SMS (summary + verification link), and push notification per guardian channel preferences. | P1 |
| FR-PAY-023 | Each receipt SHALL carry a QR code / verification code enabling authenticity verification on the school's portal (anti-forgery). | P2 |
| FR-PAY-024 | The system SHALL provide a daily collection summary by cashier, method, and category, reconciled to GL cash/bank postings. | P1 |

## 3.5 Student E-Wallet (WALL)

| ID | Requirement | Priority |
|---|---|---|
| FR-WALL-001 | Each student MAY have exactly one wallet account, maintained as a full double-entry sub-ledger (school's liability), with immutable transaction history and running balance. | P1 |
| FR-WALL-002 | Wallet top-ups SHALL be supported via M-Pesa (STK from parent portal + Paybill auto-credit), card, bank deposit, and cash at the cashier — each producing a receipt. | P1 |
| FR-WALL-003 | Wallet balances SHALL be spendable at configured service points: Transport, Library (fines/fees), School Shop, Meals/Canteen, Printing, Trips, Activities, and Emergency Purchases — each service point mapped to its income GL account. | P1 |
| FR-WALL-004 | The system SHALL provide a wallet POS interface for service-point operators: identify student (admission no., barcode/QR card scan, or search), enter/choose items or amount, confirm charge; response time ≤2s on LAN. | P1 |
| FR-WALL-005 | Wallet debits SHALL be rejected when balance is insufficient, unless a per-student overdraft allowance is explicitly configured (default zero). | P1 |
| FR-WALL-006 | The system SHALL support wallet-to-wallet transfers (e.g., sibling to sibling) permission-gated and approval-gated above configurable thresholds. | P2 |
| FR-WALL-007 | The system SHALL support wallet-to-fees transfers (apply wallet balance to invoices) initiated by parents (portal) or staff, receipted like any payment. | P1 |
| FR-WALL-008 | The system SHALL support wallet refunds (to guardian via cash/bank/M-Pesa B2C) with approval workflow; e.g., on student exit/clearance. | P1 |
| FR-WALL-009 | The system SHALL support wallet lock (no debits) and freeze (no debits or credits) with reason, actor, and automatic notification to the guardian. | P1 |
| FR-WALL-010 | The system SHALL support spending controls per wallet: daily spend limit, per-transaction limit, per-service-point limits, and category blocks (e.g., shop blocked, meals allowed) — settable by guardians (within school policy bounds) and by staff. | P1 |
| FR-WALL-011 | Guardians SHALL see wallet balance, full spend history (what, where, when), and receive configurable notifications (every transaction, daily digest, low-balance alert at threshold). | P1 |
| FR-WALL-012 | The system SHALL produce wallet statements and a school-level wallet liability report reconciling the sum of all wallet balances to the wallet control account in the GL — these SHALL always agree. | P1 |
| FR-WALL-013 | High-value wallet operations (refunds, transfers, manual adjustments above thresholds) SHALL route through the approval workflow engine. | P1 |
| FR-WALL-014 | Wallet manual adjustments SHALL require reason + approval and appear distinctly in statements; direct balance edits SHALL be impossible. | P1 |

## 3.6 Procurement (PROC)

| ID | Requirement | Priority |
|---|---|---|
| FR-PROC-001 | The system SHALL maintain a supplier registry: legal/trading names, KRA PIN, contacts, bank/M-Pesa payment details, categories supplied, payment terms, status (active/blacklisted), and document attachments. | P1 |
| FR-PROC-002 | The system SHALL support purchase requisitions raised by any authorized staff member: items, quantities, estimated cost, budget line, justification, attachments — routed through approval workflow. | P1 |
| FR-PROC-003 | The system SHALL support requesting and recording quotations against a requisition and provide a side-by-side quotation comparison (price, delivery, terms) with a documented award decision. | P1 |
| FR-PROC-004 | The system SHALL generate purchase orders from approved requisitions/quotations: sequential numbering, supplier, items, prices, taxes, delivery terms; POs are issued (PDF/email to supplier) only after approval; revisions create new versions. | P1 |
| FR-PROC-005 | PO creation SHALL validate against the relevant budget line and warn/block (configurable) on budget excess. | P1 |
| FR-PROC-006 | The system SHALL support Goods Received Notes against POs: full/partial receipt, over/under-delivery handling, quality rejection with return-to-supplier note; GRN posts inventory (for stock items) and accrues the liability. | P1 |
| FR-PROC-007 | Supplier invoices SHALL be captured against PO/GRN with 3-way matching (PO ↔ GRN ↔ invoice) and variance tolerance rules; mismatches route to exception approval. | P1 |
| FR-PROC-008 | Supplier payments SHALL be processed via payment vouchers (approval-gated) by cheque, bank transfer, M-Pesa, or cash, supporting partial payments and multi-invoice settlement, with remittance advice generation. | P1 |
| FR-PROC-009 | The system SHALL produce supplier statements and an accounts-payable aging report reconciled to the AP control account. | P1 |
| FR-PROC-010 | The system SHALL manage supplier contracts (period, value, terms, renewal alerts, attached documents). | P2 |
| FR-PROC-011 | The system SHALL support supplier rating (delivery timeliness, quality, pricing) accumulated from GRN/transaction outcomes plus manual scoring, visible during quotation comparison. | P3 |

## 3.7 Inventory & Stores (INV)

| ID | Requirement | Priority |
|---|---|---|
| FR-INV-001 | The system SHALL maintain an item master covering stock categories: uniforms, books, office supplies, consumables, and general stock — with units of measure, barcodes/QR codes, reorder levels, preferred suppliers, and GL mappings (inventory asset, expense/COGS, income for resale items). | P1 |
| FR-INV-002 | The system SHALL support multiple stores/locations with per-store stock balances and inter-store transfer documents (issue → in-transit → receive). | P1 |
| FR-INV-003 | All stock movements (GRN receipt, issue to department, sale, transfer, adjustment, write-off, return) SHALL be documented, permission-controlled, and GL-posted where financially relevant. | P1 |
| FR-INV-004 | Stock issues to departments/cost centers SHALL post consumption expense to the receiving cost center's GL lines. | P1 |
| FR-INV-005 | Uniform/book sales to students SHALL integrate with fee collection and wallet: sale → payment (cash/M-Pesa/wallet) or bill-to-student-account → stock decrement → income + COGS postings. | P1 |
| FR-INV-006 | The system SHALL support stock valuation by weighted average cost (default) with FIFO as a configurable alternative; valuation method changes are effective-dated and audit-logged. | P1 |
| FR-INV-007 | The system SHALL support barcode/QR generation and scanner-driven operations (receive, issue, sell, count). | P2 |
| FR-INV-008 | The system SHALL alert (notification center + email) when items fall to/below reorder level and support one-click requisition creation from the alert. | P2 |
| FR-INV-009 | The system SHALL support stock-take/physical count sessions: freeze snapshot, count capture (manual/scanner/import), variance report, approval-gated adjustment posting. | P1 |
| FR-INV-010 | The system SHALL provide inventory reports: stock balances by store, movement history, valuation, slow-moving/dead stock, and consumption by department. | P1 |

## 3.8 Expense Management (EXP)

| ID | Requirement | Priority |
|---|---|---|
| FR-EXP-001 | The system SHALL support a configurable expense category tree mapped to GL expense accounts and budget lines. | P1 |
| FR-EXP-002 | The system SHALL support direct expense capture (payee, category, amount, tax, payment method, attachments) routed through approval workflow before payment/posting. | P1 |
| FR-EXP-003 | The system SHALL manage petty cash: float establishment per custodian, vouchered disbursements with receipts attached, running balance, replenishment requests (approval-gated, reimbursing to float ceiling), and surprise-count support. | P1 |
| FR-EXP-004 | The system SHALL support staff expense claims: submission with itemized lines and attachments → approval chain → reimbursement via payroll or direct payment. | P2 |
| FR-EXP-005 | The system SHALL support recurring expenses (rent, utilities, subscriptions) with schedule, auto-draft creation, and approval before each posting. | P2 |
| FR-EXP-006 | Every expense SHALL support file attachments (receipts, invoices, quotes) stored in the school's object storage, virus-scanned where enabled. | P1 |
| FR-EXP-007 | Expense entry SHALL display real-time budget line status (budget, committed, actual, available) and warn/block per budget policy on overrun. | P1 |
| FR-EXP-008 | The system SHALL provide expense analytics: by category, department, payee, period; budget vs actual with variance %. | P1 |

## 3.9 Payroll (PYRL)

| ID | Requirement | Priority |
|---|---|---|
| FR-PYRL-001 | The system SHALL maintain an employee registry (payroll-relevant): bio-data, national ID, KRA PIN, NSSF number, SHA/SHIF number, bank/M-Pesa pay details, employment type (permanent, contract, casual, part-time/BOM), department, job title, hire/exit dates, and documents. | P1 |
| FR-PYRL-002 | The system SHALL support salary structures: basic pay + configurable allowances (house, transport, responsibility, hardship, etc.) and deductions, assignable per employee or per grade, effective-dated. | P1 |
| FR-PYRL-003 | The system SHALL compute Kenyan statutory deductions from versioned, effective-dated rate tables: PAYE (graduated bands + personal relief + insurance/other reliefs), NSSF (tiered), SHA/SHIF, and Affordable Housing Levy — with employer contributions computed alongside. Rates SHALL be admin-editable, never hardcoded. | P1 |
| FR-PYRL-004 | The system SHALL manage staff loans and salary advances: issuance (approval-gated), amortization schedules, automatic per-period recovery, early settlement, and balance statements. | P1 |
| FR-PYRL-005 | The system SHALL support overtime (rate rules per employee type), one-off earnings (bonus, arrears), and one-off deductions (absence/leave-without-pay deductions, fines, welfare, union dues, SACCO). | P1 |
| FR-PYRL-006 | Payroll processing SHALL run per period as a controlled pipeline: draft run → computation → variance review vs prior period (flagging changes above threshold) → approval workflow → commit (immutable) → payment execution → GL journal posting. | P1 |
| FR-PYRL-007 | Committed payroll runs SHALL be immutable; corrections occur in a subsequent run or a reversing supplementary run. | P1 |
| FR-PYRL-008 | The system SHALL generate payslips (PDF) per employee per run, delivered via a self-service link/email, access-protected. | P1 |
| FR-PYRL-009 | The system SHALL generate statutory output files/reports per period: PAYE (P10/iTax-compatible CSV), NSSF returns, SHA/SHIF returns, and Housing Levy schedules. | P1 |
| FR-PYRL-010 | The system SHALL generate bank payment schedules (per bank) and support M-Pesa B2C bulk salary disbursement where configured. | P2 |
| FR-PYRL-011 | Payroll GL journals SHALL post gross-to-net completely: expense by cost center, statutory liabilities, loan recoveries, net pay liability, and payment clearing. | P1 |
| FR-PYRL-012 | Payroll data access SHALL be restricted to payroll-permissioned roles; payroll amounts SHALL never appear in general audit views readable by non-payroll roles. | P1 |
| FR-PYRL-013 | The system SHALL produce payroll reports: payroll register, variance report, statutory summaries, cost-center analysis, YTD earnings per employee, and P9-equivalent annual tax deduction cards. | P1 |

## 3.10 Banking & Cash Management (BANK)

| ID | Requirement | Priority |
|---|---|---|
| FR-BANK-001 | The system SHALL maintain unlimited bank accounts (bank, branch, account no., currency, GL link) and cash accounts (main safe, cashier tills, petty cash floats), each with real-time ledger balance. | P1 |
| FR-BANK-002 | The system SHALL support deposits (cash → bank banking slips), withdrawals, and inter-account transfers (bank↔bank, cash↔bank) — each documented, approval-gated per thresholds, and GL-posted. | P1 |
| FR-BANK-003 | The system SHALL support bank statement import (CSV/Excel/OFX/MT940; per-bank column mapping templates) into a statement staging area. | P1 |
| FR-BANK-004 | The system SHALL provide bank reconciliation: auto-matching (amount+date+reference heuristics), manual matching, adjustment creation for bank charges/interest, unreconciled item tracking, and a reconciliation statement (book vs bank balance) locked per period on completion. | P1 |
| FR-BANK-005 | The system SHALL maintain a cheque register: cheque books, leaves, issued cheques (payee, amount, date, status: issued/presented/cleared/stopped/cancelled/stale), with stop-payment recording. | P1 |
| FR-BANK-006 | The system SHALL produce cashbook and bank book reports per account, per period, with running balances. | P1 |
| FR-BANK-007 | Cash movements between cashier tills and the main safe SHALL be documented with dual acknowledgment (sender + receiver confirmation). | P2 |

## 3.11 Accounting & General Ledger (ACC)

| ID | Requirement | Priority |
|---|---|---|
| FR-ACC-001 | The system SHALL implement full double-entry bookkeeping: every posted transaction consists of balanced debit/credit lines; the system SHALL reject unbalanced postings at the database and service layers. | P1 |
| FR-ACC-002 | The system SHALL ship with a school-oriented default Chart of Accounts (assets, liabilities, equity/funds, income, expenses — hierarchical, coded), fully customizable: add/edit/deactivate accounts; accounts with postings can be deactivated but never deleted. | P1 |
| FR-ACC-003 | Control accounts (AR–students, AP–suppliers, wallet liability, payroll liabilities, inventory, bank/cash) SHALL be system-managed: direct manual journals to control accounts are blocked or warn-and-approve per configuration, preserving sub-ledger ↔ GL agreement. | P1 |
| FR-ACC-004 | The system SHALL support manual journal entries: multi-line, balanced, with narration, attachments, and approval workflow before posting; posted journals are immutable and correctable only by reversal. | P1 |
| FR-ACC-005 | The system SHALL support recurring and reversing journal templates (accruals auto-reversing next period). | P2 |
| FR-ACC-006 | The system SHALL support opening balance capture per account (and per sub-ledger entity: student, supplier, employee loan, wallet) at go-live, balanced via an opening-balance equity account, locked after confirmation. | P1 |
| FR-ACC-007 | The system SHALL manage fiscal years and periods (aligned or not to academic years): open → soft-close (warn) → hard-close (block postings) per period, with permission-gated reopen and full audit. Year-end close SHALL roll income/expense to accumulated fund/retained surplus. | P1 |
| FR-ACC-008 | The system SHALL produce, for any period/date range with comparatives: Trial Balance, Income Statement (P&L), Balance Sheet (Statement of Financial Position), Cash Flow Statement (indirect method), and General Ledger detail per account with drill-down from statement line → account → journal → source document. | P1 |
| FR-ACC-009 | The system SHALL support budgets per fiscal year per GL account/cost center (with term/period phasing), budget vs actual reporting, and budget revision with version history and approval. | P1 |
| FR-ACC-010 | The system SHALL compute and present financial ratios (current ratio, collection rate, expense ratios, surplus margin, receivable days) on dashboard and reports. | P2 |
| FR-ACC-011 | The system SHALL support cost centers/departments as an analysis dimension on income and expense postings. | P1 |
| FR-ACC-012 | The system SHALL provide audit-support reports: journal listings by user/date/source, changes log, unusual-posting flags (weekend/after-hours postings, round-sum journals, control-account touches). | P2 |
| FR-ACC-013 | Multi-currency: base currency per school (default KES) with optional foreign-currency transactions carrying exchange rates and realized/unrealized difference postings. | P3 |

## 3.12 Fixed Assets (FA)

| ID | Requirement | Priority |
|---|---|---|
| FR-FA-001 | The system SHALL maintain a fixed asset register: asset code (auto), category, description, serial numbers, location, custodian, acquisition (date, cost, funding source, supplier/PO link), useful life, residual value, barcode/QR tag, photos and documents. | P1 |
| FR-FA-002 | Asset acquisition SHALL flow from procurement (PO/GRN capitalization) or direct capture, posting to asset GL accounts. | P1 |
| FR-FA-003 | The system SHALL compute depreciation (straight-line default; reducing balance optional) per period per category policy, with automated approval-gated depreciation journal posting and full schedules per asset. | P1 |
| FR-FA-004 | The system SHALL record asset maintenance (planned schedules and repairs, costs linked to expenses, downtime notes) with maintenance-due alerts. | P2 |
| FR-FA-005 | The system SHALL support asset transfers (location/custodian, with acknowledgment), revaluations (approval-gated, GL-posted), and disposals (sale/scrap/donation/write-off) computing gain/loss on disposal with GL postings. | P1 |
| FR-FA-006 | The system SHALL record asset insurance (policy, insurer, value, expiry) with expiry alerts. | P2 |
| FR-FA-007 | The system SHALL support asset verification exercises (scan/count, condition capture, variance report) analogous to stock-take. | P2 |
| FR-FA-008 | The system SHALL produce: asset register report, depreciation schedules, additions/disposals per period, and net book value summaries reconciled to GL asset accounts. | P1 |

## 3.13 Reports & Analytics (RPT)

| ID | Requirement | Priority |
|---|---|---|
| FR-RPT-001 | The system SHALL provide a central report catalogue including, at minimum: Student Ledger, Parent Ledger, Cashbook, Bank Book, General Ledger, Trial Balance, Balance Sheet, Income Statement, Cash Flow, Payroll reports, Expense reports, Supplier reports, Revenue reports, Wallet reports, Invoice reports, Receipt reports, Fee Collection reports, Outstanding/Defaulter reports, Aging reports, Tax reports, and Audit reports. | P1 |
| FR-RPT-002 | Every report SHALL support parameterization (date range, academic period, class/stream, category, account, user, method, status as applicable) with saved parameter presets per user. | P1 |
| FR-RPT-003 | Every report SHALL export to PDF (branded, headers/footers, signatures/watermarks per BRND), Excel (typed columns), CSV, and print layout. | P1 |
| FR-RPT-004 | Reports SHALL be permission-gated per report and, where applicable, per scope (e.g., a department head sees own department expenses only). | P1 |
| FR-RPT-005 | Long-running reports SHALL execute as background jobs with notification + download link on completion; interactive reports SHALL paginate server-side. | P1 |
| FR-RPT-006 | Financial statement reports SHALL support comparative columns (previous period/year, budget) and drill-down to source transactions. | P1 |
| FR-RPT-007 | The system SHALL support scheduled reports (e.g., daily collection summary emailed to the Director at 18:00) with per-schedule recipients and formats. | P2 |
| FR-RPT-008 | All monetary report totals SHALL reconcile exactly with the GL for the same scope and period — reports read from the ledger, not parallel stores. | P1 |

## 3.14 Communications & Notification Center (COMM)

| ID | Requirement | Priority |
|---|---|---|
| FR-COMM-001 | The system SHALL provide an in-app Notification Center per user: unread badge, list, mark read/unread, per-category preferences, deep links to the relevant record. | P1 |
| FR-COMM-002 | The system SHALL deliver notifications via SMS (pluggable gateways), Email (SMTP), Push (Firebase FCM), and in-app; WhatsApp SHALL be supported as a provider-ready channel (template + adapter interface) activatable when the school configures a WhatsApp Business API provider. | P1 |
| FR-COMM-003 | The system SHALL fire event-driven notifications for at minimum: Invoice Created, Invoice Due (approaching), Invoice Overdue, Payment Received, Wallet Top-up, Wallet Low Balance, Receipt Generated, Payroll Complete (payslip ready), Approval Required, Approval Decision (approved/rejected), Expense Approved, Cheque Bounced, Stock Reorder, License/Subscription events. Each trigger SHALL be individually enable/disable-able per channel. | P1 |
| FR-COMM-004 | Notification templates SHALL be editable per event per channel with merge variables (student name, amount, balance, dates, school name…), preview with sample data, and language variants per school localization. | P1 |
| FR-COMM-005 | The system SHALL support custom/ad-hoc broadcasts to targeted audiences (class, defaulters above X, all guardians, staff group) with approval gate, cost estimate (SMS units), and delivery report. | P1 |
| FR-COMM-006 | All outbound messages SHALL be queued (BullMQ) with retry/backoff, provider failover where multiple gateways are configured, and a full send log (recipient, channel, status, provider reference, cost) — messages survive restarts and offline windows. | P1 |
| FR-COMM-007 | The system SHALL track SMS credit balances where the gateway exposes them and alert on low credit. | P2 |
| FR-COMM-008 | Recipients SHALL be able to opt out of non-essential communications per channel; financially essential notices (invoices, receipts) SHALL be flagged exempt per school policy. | P2 |

## 3.15 Approval Workflows (APPR)

| ID | Requirement | Priority |
|---|---|---|
| FR-APPR-001 | The system SHALL provide a configurable approval workflow engine applicable to at minimum: Fee Waivers, Discounts, Refunds, Procurement (requisition, PO, supplier payment), Expenses & petty cash replenishment, Payroll runs, Journal Entries, Budgets & revisions, Purchase Orders, Wallet operations above thresholds, and any custom-defined approval chain. | P1 |
| FR-APPR-002 | Approval chains SHALL support: multiple sequential levels, amount-based routing (thresholds select the chain/levels), role- or user-based approvers, parallel approvers with quorum (any-1-of-N or all), and department scoping. | P1 |
| FR-APPR-003 | Approvers SHALL be able to approve, reject (mandatory reason), or return-for-revision; every decision is timestamped, commented, and audit-logged; the full decision trail SHALL be visible on the document. | P1 |
| FR-APPR-004 | The system SHALL enforce self-approval prevention (initiator can never approve own request, at any level) and segregation-of-duties rules from FR-USER-009. | P1 |
| FR-APPR-005 | The system SHALL support delegation of approval authority (date-bounded, audit-logged, e.g., during leave) and escalation on SLA breach (auto-remind, then escalate to next level after configurable hours). | P2 |
| FR-APPR-006 | Pending approvals SHALL be actionable from the dashboard/notification center with full document context inline (no hunting through modules), including via mobile browser. | P1 |
| FR-APPR-007 | No workflow-covered document SHALL post financial effects before final approval; drafts and in-approval documents SHALL be clearly stateful (Draft → Submitted → In Approval → Approved/Rejected → Posted). | P1 |

## 3.16 Settings & System Configuration (SET)

| ID | Requirement | Priority |
|---|---|---|
| FR-SET-001 | The system SHALL provide a School Profile: name, registration numbers, KRA PIN, contacts, address, logo, motto — consumed by all documents and reports. | P1 |
| FR-SET-002 | The system SHALL manage Academic Years and Terms (dates, current-term pointer, locking of past terms for billing changes). | P1 |
| FR-SET-003 | The system SHALL provide configuration UIs for: SMTP, SMS gateway(s), Firebase (push), M-Pesa (Daraja credentials per shortcode), QuickBooks/Xero/Sage connections, and bank integrations — each with a "test connection" action and encrypted credential storage. | P1 |
| FR-SET-004 | The system SHALL support currency configuration (base currency, symbol, formatting) and localization: language (English default; Kiswahili and French as provided locales; extensible), date/number formats, and timezone. | P1 |
| FR-SET-005 | The system SHALL support custom fields (typed: text, number, date, select) on students, suppliers, employees, and assets, usable in filters and exports. | P2 |
| FR-SET-006 | The system SHALL expose numbering series configuration (prefixes, formats, next numbers) for invoices, receipts, credit/debit notes, POs, GRNs, vouchers, journals — with gapless integrity preserved. | P1 |
| FR-SET-007 | The system SHALL expose document layout settings for receipts and invoices (paper sizes, fields shown, footer text) per BRND capabilities. | P2 |
| FR-SET-008 | The system SHALL provide Backup Settings: schedule (default nightly), retention counts, destination (local path, MinIO bucket, external S3-compatible target), encryption passphrase, and on-demand "Backup Now" — with backup history and last-success indicator (see BKP). | P1 |
| FR-SET-009 | The system SHALL provide notification template management (per FR-COMM-004) and approval workflow configuration (per APPR) under Settings, permission-gated to System Admin-class roles. | P1 |
| FR-SET-010 | All settings changes SHALL be audit-logged with before/after values (credentials masked). | P1 |

## 3.17 Branding & White-Labeling (BRND)

| ID | Requirement | Priority |
|---|---|---|
| FR-BRND-001 | The system SHALL ship with the Infoney Solutions default theme: Poppins typography; primary Deep Purple `#573399`; secondary Bright Yellow `#FBF80D` and Gold/Orange `#CFA22D`; supporting Light Purple `#9371F8`, Soft Purple `#A972FA`, Lavender `#CCACF4`, White `#FDFDFE`, Dark Purple `#341E40`, Black `#000000` — implemented as design tokens (CSS variables) so re-branding never requires code changes. | P1 |
| FR-BRND-002 | Each school SHALL be able to customize: school name, logo, favicon, primary/secondary colors, login page (imagery, welcome text), email templates, SMS templates, invoice & receipt branding, report headers/footers, digital signatures (images applied to documents), watermarks, and theme preference defaults (Light/Dark/System). | P1 |
| FR-BRND-003 | Branding changes SHALL apply system-wide immediately (or on publish) with live preview before publish, and a one-click "restore Infoney defaults". | P2 |
| FR-BRND-004 | The system SHALL enforce accessible contrast: when a school picks colors failing WCAG AA contrast against backgrounds, the UI SHALL warn and offer nearest compliant alternatives. | P2 |
| FR-BRND-005 | All generated documents (invoices, receipts, statements, reports, payslips) and outbound communications SHALL consistently carry the active school branding. | P1 |
| FR-BRND-006 | Dark mode SHALL be fully supported across every screen, respecting the school palette with automatically derived dark-safe variants. | P1 |

## 3.18 Integrations (INTG)

| ID | Requirement | Priority |
|---|---|---|
| FR-INTG-001 | **M-Pesa (Daraja)**: The system SHALL implement STK Push (initiate, callback, status query), C2B (register URLs, validation, confirmation), B2C (refunds/disbursements with result handling), Transaction Status, and Reversal APIs — with sandbox/production modes, per-shortcode configuration, signed callback validation, idempotency, and a full M-Pesa transaction log with reconciliation view against receipts. | P1 |
| FR-INTG-002 | **QuickBooks Online**: The system SHALL support one-way export/sync of GL journals, chart-of-accounts mapping, customers/suppliers as configured — OAuth2 connection, mapping UI, sync logs, conflict reporting. | P2 |
| FR-INTG-003 | **Xero** and **Sage**: The system SHALL provide equivalent export/sync adapters behind a common accounting-connector interface (mapping, scheduling, logs). | P3 |
| FR-INTG-004 | **Bank APIs**: The system SHALL provide a bank-connector interface for statement fetch and (where available) payment initiation, with per-bank adapters addable without core changes; file-based import (FR-BANK-003) is the universal fallback. | P2 |
| FR-INTG-005 | **Firebase**: FCM push notifications to parent/staff PWA/mobile clients, with token lifecycle management. | P2 |
| FR-INTG-006 | **SMTP & SMS gateways**: pluggable provider adapters (at minimum: generic SMTP; Africa's Talking-compatible and generic HTTP SMS adapters) with failover ordering. | P1 |
| FR-INTG-007 | **Webhooks (outbound)**: The system SHALL emit signed webhooks (HMAC) for subscribable events (payment received, invoice created, etc.) with per-endpoint secrets, retry with exponential backoff, and delivery logs. | P2 |
| FR-INTG-008 | All integrations SHALL be optional, individually configurable, and failure-isolated: an integration outage SHALL never block core operations (queue-and-retry semantics). | P1 |
| FR-INTG-009 | All external credentials SHALL be stored encrypted at rest (application-layer encryption over DB storage) and never exposed in logs, exports, or API responses. | P1 |

## 3.19 Public API Layer (API)

| ID | Requirement | Priority |
|---|---|---|
| FR-API-001 | The system SHALL expose a complete, versioned REST API (`/api/v1/...`) covering all module operations used by the frontend — the frontend consumes the same public API (API-first). | P1 |
| FR-API-002 | The API SHALL be fully documented via Swagger/OpenAPI 3.1 (auto-generated from code decorators), served per-instance with try-it-out in non-production modes. | P1 |
| FR-API-003 | The API SHALL support two auth schemes: JWT (interactive users) and API Keys (machine consumers) — API keys are named, scoped to permission sets, expiring, rotatable, and revocable, with last-used tracking. | P1 |
| FR-API-004 | The API SHALL enforce rate limiting (per user, per API key, per IP; configurable tiers) returning standard 429 semantics with `Retry-After`. | P1 |
| FR-API-005 | The API SHALL implement consistent conventions: enveloped error format with machine-readable codes, cursor/offset pagination, field filtering, sorting, sparse fieldsets, and idempotency keys on payment-creating endpoints. | P1 |
| FR-API-006 | All API mutations SHALL flow through the same validation, RBAC, approval, and audit pipelines as UI operations — no privileged bypass paths. | P1 |
| FR-API-007 | API access SHALL be audit-logged (key/user, endpoint, status, latency) with anomaly surfacing (spikes, repeated auth failures). | P2 |
| FR-API-008 | Breaking changes SHALL only ship in a new API version; prior versions remain supported per a published deprecation policy (minimum one major release overlap). | P2 |

## 3.20 Licensing & Super Admin Interface (LIC)

> **Cardinal rule:** the Super Admin Portal has **zero access to financial data**. The licensing API is the only channel, and its surface is exhaustively enumerated here. Anything not listed is denied.

| ID | Requirement | Priority |
|---|---|---|
| FR-LIC-001 | Each instance SHALL hold a signed license (school identity, plan, seats/limits if any, validity window, feature flags) verified locally by public-key signature — enabling offline validation. | P1 |
| FR-LIC-002 | The licensing API SHALL allow the Super Admin Portal to exclusively: register a new school instance, create a subscription, activate a school, suspend a school, renew a subscription, deactivate a school, view license status, view usage statistics (as defined in FR-LIC-005), and push/announce system updates. No other endpoint SHALL exist on this surface. | P1 |
| FR-LIC-003 | The licensing channel SHALL use mutual authentication (instance key pair + Infoney-signed tokens), TLS-only, with replay protection; every licensing call is audit-logged on the instance and visible to the school's System Admin. | P1 |
| FR-LIC-004 | The Super Admin SHALL NOT be able to read, query, export, or infer any financial records, student data, user data, documents, or configuration. The licensing API responses SHALL be limited to license state and the usage-statistics payload of FR-LIC-005. This SHALL be enforced structurally (the endpoints simply do not access those tables), not by permissions alone. | P1 |
| FR-LIC-005 | Usage statistics reported SHALL be strictly non-financial aggregates: instance version, uptime, active user count, student record count, storage utilization, last backup timestamp, and license state. No amounts, balances, names, or transaction data — ever. The exact payload SHALL be documented and visible to the school. | P1 |
| FR-LIC-006 | License state machine and behavior: **ACTIVE** (full function) → on expiry **GRACE** (full function, banner warnings, configurable grace days, default 14) → **SUSPENDED** (read-only: login, viewing, reports, and data export remain available; all financial mutations blocked) → **DEACTIVATED** (login blocked except System Admin data-export access). The school's data SHALL remain fully exportable in every state — suspension never holds data hostage. | P1 |
| FR-LIC-007 | Instances SHALL tolerate offline licensing: local signed-license validation covers the validity window plus grace; no "phone home or die" behavior within a valid license period. | P1 |
| FR-LIC-008 | Update push SHALL be announce-and-consent: the Super Admin publishes an update (version, notes, urgency); the instance notifies the school System Admin, who schedules/applies it. Security-critical updates MAY be flagged mandatory-by-date. Updates never execute silently against the school's will, and every update run creates a pre-update backup automatically. | P1 |

## 3.21 Backup, Restore & System Operations (BKP)

| ID | Requirement | Priority |
|---|---|---|
| FR-BKP-001 | The system SHALL perform automatic scheduled backups (default nightly) of the PostgreSQL database and uploaded files, encrypted (AES-256, school passphrase), with configurable retention (default: 7 daily, 4 weekly, 12 monthly). | P1 |
| FR-BKP-002 | Backup destinations SHALL include local disk and any S3-compatible target (MinIO/local, or school-chosen offsite); multi-destination fan-out SHALL be supported. | P1 |
| FR-BKP-003 | The system SHALL provide on-demand backup, backup verification (restore-test integrity check of the archive), backup history with sizes and outcomes, and failure alerts to System Admin (email + notification). | P1 |
| FR-BKP-004 | The system SHALL provide a guided restore procedure (documented and scripted) with pre-restore safety snapshot; restores are System-Admin-only and fully audit-logged. | P1 |
| FR-BKP-005 | The system SHALL expose an operations/health page: service status (DB, Redis, queues, storage, SMTP), queue depths, disk usage, last backup, and version info. | P2 |

---

# 4. External Interface Requirements

## 4.1 User Interfaces

| ID | Requirement |
|---|---|
| IR-001 | The web application SHALL be fully responsive from 360px (mobile) through ultrawide desktop; counter/cashier and POS screens SHALL be optimized for keyboard-first operation with visible shortcut hints. |
| IR-002 | The UI SHALL implement the design system on shadcn/ui + TailwindCSS with the token-driven theme (BRND), rounded components, consistent spacing scale, and Framer Motion micro-interactions — targeting the quality bar of Stripe Dashboard, Xero, Linear, Notion, QuickBooks Online, and Vercel Dashboard. |
| IR-003 | Every screen SHALL implement all six UI states: loading (skeletons), error (retry affordance), empty (guidance + primary action), permission-denied, offline/degraded, and populated. |
| IR-004 | The UI SHALL meet WCAG 2.1 AA: keyboard navigability, focus management, ARIA semantics, contrast, reduced-motion respect, and screen-reader-tested critical flows (payment capture, approvals). |
| IR-005 | Light, Dark, and System theme modes SHALL be available on every screen, user-selectable, defaulting per school setting. |
| IR-006 | The parent portal SHALL be a mobile-first experience (installable PWA) covering: children's balances, invoices, statements, receipts, wallet top-up (STK Push), wallet controls, and notification preferences. |

## 4.2 Hardware Interfaces

| ID | Requirement |
|---|---|
| IR-010 | Receipt printing SHALL support 80mm ESC/POS thermal printers (via OS print pipeline and raw-print agent where installed) and standard A4 printers via browser print CSS. |
| IR-011 | Barcode/QR scanners SHALL be supported as HID keyboard-wedge devices on all scan-enabled screens (student cards, inventory, assets). |
| IR-012 | Cash drawers SHALL be supported via printer kick-out where the thermal printing path permits. |
| IR-013 | Card/POS terminals operate standalone; the system captures terminal reference numbers for reconciliation (no direct terminal integration required in v1). |

## 4.3 Software Interfaces

| ID | External System | Interface |
|---|---|---|
| IR-020 | Safaricom Daraja (M-Pesa) | HTTPS REST: OAuth token, STK Push, C2B register/validation/confirmation, B2C, Transaction Status, Reversal; inbound callbacks over TLS to instance's public callback URL (or via Infoney-provided relay for LAN-only schools — relay carries only M-Pesa payloads, never exposes school data). |
| IR-021 | QuickBooks Online | OAuth2 + REST (journals, accounts, entities per mapping). |
| IR-022 | Xero / Sage | OAuth2 + REST via accounting-connector interface. |
| IR-023 | Firebase Cloud Messaging | HTTPS v1 API for push. |
| IR-024 | SMTP | SMTP/TLS submission (local relay or external). |
| IR-025 | SMS gateways | HTTPS REST adapters (Africa's Talking-compatible + generic HTTP template adapter). |
| IR-026 | Bank statement files | CSV/Excel/OFX/MT940 import parsers with mapping templates. |
| IR-027 | Super Admin Portal | Licensing API only, per §3.20 — mutual auth, TLS, enumerated endpoints. |
| IR-028 | Third-party consumers | Public REST API v1 with API keys and webhooks per §3.19 / FR-INTG-007. |

## 4.4 Communication Interfaces

| ID | Requirement |
|---|---|
| IR-030 | All HTTP traffic SHALL be served over TLS 1.2+ (Nginx-terminated); HTTP redirects to HTTPS; HSTS enabled on internet-facing deployments. |
| IR-031 | WebSocket connections (dashboard live updates, notification center) SHALL authenticate with the same JWT session and reconnect transparently. |
| IR-032 | All outbound integration traffic SHALL be TLS with certificate validation; callback endpoints SHALL validate source signatures/credentials where the provider supports it. |

---

# 5. Non-Functional Requirements

## 5.1 Performance (NFR-PERF)

| ID | Requirement |
|---|---|
| NFR-PERF-001 | Interactive API reads: P95 ≤ 500ms; writes P95 ≤ 1s on baseline hardware with a 2,000-student dataset and 50 concurrent users. |
| NFR-PERF-002 | Cashier receipt flow (lookup → capture → receipt render): ≤ 5 seconds end-to-end on LAN. |
| NFR-PERF-003 | Dashboard initial render ≤ 3s; subsequent navigations ≤ 1.5s (route-level code splitting, cached queries). |
| NFR-PERF-004 | Bulk billing: ≥ 2,000 student invoices generated in ≤ 5 minutes as a background job without degrading interactive latency beyond 2× baseline. |
| NFR-PERF-005 | Standard reports (≤ 10k rows) ≤ 10s; larger reports run as background jobs (FR-RPT-005). |
| NFR-PERF-006 | System SHALL support schools up to 10,000 students and 500 staff on recommended hardware without architectural change. |

## 5.2 Scalability & Capacity (NFR-SCAL)

| ID | Requirement |
|---|---|
| NFR-SCAL-001 | 10+ years of transactional history SHALL remain online and reportable; archiving strategies MAY optimize but never remove drill-down. |
| NFR-SCAL-002 | The application SHALL scale vertically (bigger host) and horizontally (multiple app containers behind Nginx) without code change; queues and websockets SHALL be multi-instance-safe via Redis. |
| NFR-SCAL-003 | File storage SHALL handle ≥ 500 GB of documents per instance via MinIO without performance collapse. |

## 5.3 Security (NFR-SEC)

| ID | Requirement |
|---|---|
| NFR-SEC-001 | The system SHALL conform to OWASP ASVS Level 2 controls; OWASP Top 10 classes (injection, XSS, CSRF, broken auth/access, SSRF, etc.) SHALL each have explicit mitigations verified in Phase 9 security testing. |
| NFR-SEC-002 | SQL injection protection via parameterized queries/ORM exclusively; no string-built SQL. XSS protection via framework escaping + CSP headers. CSRF protection on any cookie-based session surface. |
| NFR-SEC-003 | Encryption: TLS in transit; AES-256 for backups and application-encrypted secrets at rest; bcrypt for passwords; hashed (not encrypted) API key storage. |
| NFR-SEC-004 | Rate limiting on all public endpoints; stricter tiers on auth, OTP, and payment initiation. |
| NFR-SEC-005 | Security headers (CSP, X-Content-Type-Options, Referrer-Policy, frame-ancestors) enforced at Nginx and app layers. |
| NFR-SEC-006 | Dependency vulnerability scanning and image scanning SHALL run in CI; critical CVEs block release. |
| NFR-SEC-007 | Uploaded files SHALL be extension/MIME validated, size-limited, stored outside the web root (object storage), and served with safe content dispositions; optional AV scanning hook. |
| NFR-SEC-008 | Secrets (DB, JWT keys, integration credentials) SHALL come from environment/secret files, never committed or logged; JWT signing keys rotatable. |
| NFR-SEC-009 | Principle of least privilege applies to service accounts: app DB user has no superuser/DDL rights at runtime (migrations run separately). |

## 5.4 Availability & Reliability (NFR-AVL)

| ID | Requirement |
|---|---|
| NFR-AVL-001 | Target availability 99.5% during school operating hours; planned maintenance outside them. |
| NFR-AVL-002 | Financial integrity over availability: on any doubt (partial failure, callback uncertainty) the system SHALL fail safe — no double-posting, no lost payments; all money paths idempotent and transactional. |
| NFR-AVL-003 | Power-loss tolerance: the system SHALL recover to a consistent state after abrupt host shutdown (WAL-based DB durability, resumable queues, crash-safe jobs). |
| NFR-AVL-004 | RPO ≤ 24h with default nightly backups (≤ 15 min where WAL archiving is enabled); RTO ≤ 4h using the documented restore procedure. |
| NFR-AVL-005 | Queue-backed external operations (SMS, email, M-Pesa queries, webhooks) SHALL retry with backoff and dead-letter with operator visibility. |

## 5.5 Usability & Accessibility (NFR-USE)

| ID | Requirement |
|---|---|
| NFR-USE-001 | A cashier with basic computer literacy SHALL complete a standard fee payment after ≤ 30 minutes of training; core flows require ≤ 3 clicks/keystrokes beyond data entry. |
| NFR-USE-002 | WCAG 2.1 AA conformance (per IR-004) verified with automated (axe) + manual audits in Phase 9. |
| NFR-USE-003 | All user-facing text SHALL be externalized for i18n; English default, Kiswahili and French locale files provided; new locales addable without code changes. |
| NFR-USE-004 | Every destructive or financial action SHALL have explicit confirmation with consequence summary; irreversible actions state so plainly. |
| NFR-USE-005 | Error messages SHALL be actionable and human-readable; no raw stack traces or codes without explanation ever reach the UI. |

## 5.6 Maintainability & Code Quality (NFR-MNT)

| ID | Requirement |
|---|---|
| NFR-MNT-001 | Codebase SHALL follow Clean Architecture with SOLID principles and DDD tactical patterns where warranted; module boundaries mirror §2.3. |
| NFR-MNT-002 | TypeScript strict mode everywhere; linting (ESLint) + formatting (Prettier) enforced in CI; no `any` leakage across module boundaries. |
| NFR-MNT-003 | Test coverage gates: ≥ 80% on services/domain logic; critical money paths (posting, allocation, wallet, payroll computation) ≥ 95% with property/scenario tests. |
| NFR-MNT-004 | Database changes exclusively via versioned, reversible TypeORM migrations; no manual schema edits. |
| NFR-MNT-005 | Structured JSON logging with correlation IDs across HTTP → service → queue → integration hops; log levels configurable at runtime. |
| NFR-MNT-006 | Semantic versioning of the application; every release ships upgrade migrations + rollback notes. |

## 5.7 Portability & Deployability (NFR-PORT)

| ID | Requirement |
|---|---|
| NFR-PORT-001 | Identical Docker Compose deployment on Ubuntu Server and Windows Server; a single environment file drives configuration. |
| NFR-PORT-002 | Guided installer scripts (bash + PowerShell) SHALL provision a full instance — preflight checks, TLS setup, initial admin creation — in ≤ 60 minutes on baseline hardware. |
| NFR-PORT-003 | Full instance migration (host-to-host) SHALL be achievable via backup + restore alone, documented and tested. |

## 5.8 Data Integrity & Auditability (NFR-INT)

| ID | Requirement |
|---|---|
| NFR-INT-001 | Every financial mutation is ACID-transactional end-to-end (document + sub-ledger + GL in one transaction). |
| NFR-INT-002 | Sub-ledger ↔ control account equality (students/AR, suppliers/AP, wallets, inventory, payroll liabilities) SHALL hold at all times; a scheduled integrity job verifies and alerts on any variance. |
| NFR-INT-003 | Gapless numbering guarantees survive concurrency (DB-level sequencing with transactional allocation). |
| NFR-INT-004 | Monetary arithmetic uses exact decimal math; rounding rules are explicit, consistent, and documented per document type. |

---

# 6. Data Requirements

| ID | Requirement |
|---|---|
| DR-001 | Monetary values: `NUMERIC(18,4)` storage; presentation rounding per currency (KES: 2 dp); rounding at line level with documented totaling rules. |
| DR-002 | All timestamps in UTC (`timestamptz`); business dates (due dates, term dates) as `date` in school timezone semantics. |
| DR-003 | Primary keys: UUIDv7 for entities; human-facing document numbers are separate business keys (FR-SET-006). |
| DR-004 | Soft-state pattern: financial documents carry status lifecycles; nothing financially posted is ever hard-deleted (constraint-enforced). |
| DR-005 | Retention: financial records ≥ 10 years online; audit logs ≥ 7 years; communication logs ≥ 2 years — all configurable upward, never below statutory minimums. |
| DR-006 | Personal data fields (guardian contacts, employee identifiers) SHALL be classified in the data dictionary for Data Protection Act handling (access, export, minimization). |
| DR-007 | Every table carries `created_at`, `updated_at`, `created_by`, `updated_by`; naming conventions and the full data dictionary are Phase 4 deliverables bound by this SRS. |
| DR-008 | The school SHALL be able to export its complete data (full DB backup + document archive + CSV extracts of major registers) at any time, in every license state (per FR-LIC-006). |

---

# 7. Legal, Regulatory & Compliance Requirements

| ID | Requirement |
|---|---|
| CR-001 | **Kenya Data Protection Act 2019**: lawful-basis documentation, subject access/export support, breach-notification runbook, data minimization in logs and integrations; school is data controller, the system provides controller tooling. |
| CR-002 | **KRA payroll compliance**: PAYE computation per gazetted bands with effective-dated rates; iTax-compatible P10 outputs; P9-equivalent annual cards (FR-PYRL-009/013). |
| CR-003 | **NSSF Act, SHIF/SHA, Affordable Housing Levy**: tiered/percentage computations with employer portions, effective-dated, with return schedules. |
| CR-004 | **eTIMS readiness**: invoice data model SHALL carry fields required for KRA eTIMS onboarding (PIN, invoice codes) so an eTIMS adapter can be added without schema redesign. (Adapter itself: integration roadmap item, interface reserved.) |
| CR-005 | Financial statements SHALL be presentable in formats acceptable to Kenyan school auditors (fund/accumulated-surplus presentation), with IFRS-for-SMEs-aligned terminology configurable. |
| CR-006 | The system SHALL support auditor access (read-only role + audit exports) satisfying typical Ministry of Education and external-audit information requests. |

---

# 8. Appendices

## Appendix A — Requirement Traceability Scheme

Every artifact in later phases references SRS IDs:

- Phase 2 use cases: `UC-<MOD>-##` ↔ `FR-<MOD>-###`; acceptance criteria `AC-<UC>-##`.
- Phase 4 tables/columns trace to DR-* and FR-*.
- Phase 5/6 modules trace to module codes; tests reference FR/NFR IDs.
- Phase 9 test cases: `TC-<FR-ID>-##`.

A traceability matrix is maintained from Phase 2 onward.

## Appendix B — Module → Requirement Count Summary

| Module | ID Prefix | Requirements |
|---|---|---|
| Auth/Users/Audit | AUTH/USER/AUD | 28 |
| Dashboard | DASH | 12 |
| Student Billing | BILL | 30 |
| Fee Collection | PAY | 16 |
| E-Wallet | WALL | 14 |
| Procurement | PROC | 11 |
| Inventory | INV | 10 |
| Expenses | EXP | 8 |
| Payroll | PYRL | 13 |
| Banking | BANK | 7 |
| Accounting | ACC | 13 |
| Fixed Assets | FA | 8 |
| Reports | RPT | 8 |
| Communications | COMM | 8 |
| Approvals | APPR | 7 |
| Settings | SET | 10 |
| Branding | BRND | 6 |
| Integrations | INTG | 9 |
| API | API | 8 |
| Licensing | LIC | 8 |
| Backup/Ops | BKP | 5 |
| **Functional total** | | **239** |
| Interface (IR) | | 20 |
| Non-functional (NFR) | | 31 |
| Data (DR) | | 8 |
| Compliance (CR) | | 6 |
| **Grand total** | | **304** |

## Appendix C — Future Scope (Reserved, Not in v1 Build)

- University mode: faculties, semesters, credit-hour billing, HELB integration hooks (data model keeps `institution_type` and period abstractions ready).
- KRA eTIMS live adapter (interface reserved per CR-004).
- Biometric student identification at wallet POS points.
- Native mobile apps (the PWA is the v1 mobile strategy).
- Direct card-terminal integrations.

## Appendix D — Glossary

See §1.5. The Phase 4 data dictionary extends this glossary to entity level.

---

**END OF SRS — Version 1.0**

> **Phase gate:** This document awaits your approval. Upon approval, Phase 2 will produce: detailed Functional Requirements decomposition, Non-functional Requirements elaboration, Business Rules catalogue, Use Cases, and Acceptance Criteria — each traced to the requirement IDs defined here.

