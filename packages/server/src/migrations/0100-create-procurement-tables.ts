import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * docs/phase-4/04-schema-operations.md §2, the `proc_*` DDL — Module 12
 * (Procurement), **foundation pass only**: entities/repositories/migration/
 * triggers (docs/phase-5/PROGRESS.md). Application-layer services
 * (requisition->quotation->PO workflow, GRN receiving with 3-way match,
 * supplier invoice matching, payment vouchers, supplier ratings,
 * controllers, tests, seed) land in a later pass.
 *
 * **Table count**: the DDL's 13 entries — counting the two `_line` child
 * tables named inline (`proc_requisition_line`, `proc_quotation_line`) plus
 * `proc_grn_line`/`proc_po_line`/`proc_voucher_allocation` — are realized
 * as-is, 13 physical tables, no `proc_invoice_match` table (the §2 ERD
 * mermaid diagram names one, but the column-level DDL list this pass
 * implements deliberately omits it — 3-way-match results live in
 * `proc_supplier_invoice.match_variance` jsonb instead).
 *
 * Table order follows the FK dependency chain: `proc_supplier` (no deps) ->
 * `proc_requisition` (FK `usr_user`/`usr_department`) ->
 * `proc_requisition_line` (FK `proc_requisition`/`gl_budget_line`) ->
 * `proc_quotation` (FK `proc_requisition`/`proc_supplier`/`file_object`) ->
 * `proc_quotation_line` (FK `proc_quotation`) -> `proc_purchase_order` (FK
 * `proc_supplier`/`proc_requisition`/`proc_quotation`, self-ref
 * `supersedes_id`) -> `proc_po_line` (FK `proc_purchase_order`) ->
 * `proc_grn` (FK `proc_purchase_order`/`usr_user`/`gl_journal`) ->
 * `proc_grn_line` (FK `proc_grn`/`proc_po_line`) -> `proc_supplier_invoice`
 * (FK `proc_supplier`/`proc_purchase_order`/`gl_journal`) ->
 * `proc_payment_voucher` (FK `proc_supplier`/`gl_journal`) ->
 * `proc_voucher_allocation` (FK `proc_payment_voucher`/
 * `proc_supplier_invoice`) -> `proc_contract` (FK `proc_supplier`/
 * `file_object`).
 *
 * **`proc_contract.status`** carries a CHECK the source DDL doesn't specify
 * an enum for — `ACTIVE|EXPIRED|TERMINATED`, a documented judgement call
 * (see `ProcContractEntity`'s doc comment for the reasoning).
 *
 * Three triggers realize this pass's DB-layer invariants:
 * 1. `trg_proc_po_immutable` (FR-PROC-004.1) — `BEFORE UPDATE` on
 *    `proc_purchase_order`, rejects changes to `subtotal`/`tax_amount`/
 *    `total`/`supplier_id` once `status` has ever reached `ISSUED` or beyond
 *    (`OLD.status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED')`) — a
 *    revision must create a NEW PO row (`supersedes_id`), never edit in
 *    place. `status`/`issued_at`/`version` (and every other column) remain
 *    ordinarily writable — the exact minimal explicit-column-list style
 *    `trg_bill_invoice_immutable`/`trg_pay_receipt_immutable` established,
 *    scoped to only the columns the task brief names (see
 *    `ProcPurchaseOrderEntity`'s doc comment for the narrower-than-DDL-prose
 *    scoping judgement call).
 * 2. `trg_proc_grn_qty_cap` (BR-PROC-03) — `BEFORE INSERT OR UPDATE` on
 *    `proc_grn_line`, computes `SUM(received_qty)` across all GRN lines for
 *    the same `po_line_id` (including the new/updated row, added
 *    arithmetically since a `BEFORE` trigger fires before `NEW` is visible
 *    to a self-join) and rejects if it would exceed that PO line's `qty`
 *    plus a **hard-coded 5% tolerance ceiling** — a defense-in-depth
 *    backstop only. The REAL configurable tolerance percentage (read from
 *    Settings) belongs in the next pass's GRN-posting service; this DB
 *    trigger is the non-configurable hard ceiling, never the primary
 *    enforcement point.
 * 3. `trg_proc_voucher_allocation_sum` (BR-PROC-04, sum half only) — a
 *    `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED AFTER INSERT OR
 *    UPDATE OR DELETE` on `proc_voucher_allocation`, asserting `SUM(amount)`
 *    per `voucher_id` equals that voucher's `total` at COMMIT — the exact
 *    deferred-aggregate pattern `trg_pay_splits_sum`/
 *    `trg_bill_installments_sum` established. The OTHER half of BR-PROC-04
 *    ("allocation <= invoice open balance") is a cross-row runtime check
 *    needing `proc_supplier_invoice.paid_amount` at the moment of
 *    allocation — a genuinely cross-row, time-of-write concern this DB
 *    trigger cannot see in isolation, deliberately left to the next pass's
 *    SERVICE layer. Summary: **DB enforces the sum-equals-total invariant;
 *    service enforces the per-allocation ceiling.**
 */
export class CreateProcurementTables0100 implements MigrationInterface {
  name = "CreateProcurementTables1700000000100";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.proc_supplier (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        name varchar(120) NOT NULL,
        trading_name varchar(120) NULL,
        kra_pin varchar(15) NULL,
        contacts jsonb NOT NULL DEFAULT '{}',
        payment_details jsonb NOT NULL DEFAULT '{}',
        categories varchar(40)[] NOT NULL DEFAULT '{}',
        payment_terms_days int NOT NULL DEFAULT 30,
        status varchar(12) NOT NULL,
        blacklist_reason text NULL,
        rating_delivery numeric(3,2) NULL,
        rating_quality numeric(3,2) NULL,
        rating_manual numeric(3,2) NULL,
        CONSTRAINT uq_proc_supplier_name UNIQUE (name),
        CONSTRAINT ck_proc_supplier_status CHECK (status IN ('ACTIVE','BLACKLISTED','INACTIVE'))
      )
    `);
    // DDL's own `ix: GIN trgm(name)` — pg_trgm enabled in migration 0001, whose doc comment already names proc_* as a future consumer.
    await queryRunner.query(`
      CREATE INDEX ix_proc_supplier_name_trgm ON app.proc_supplier USING GIN (name gin_trgm_ops)
    `);

    await queryRunner.query(`
      CREATE TABLE app.proc_requisition (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        requested_by uuid NOT NULL,
        department_id uuid NOT NULL,
        justification text NOT NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        budget_snapshot jsonb NULL,
        total_estimate numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT uq_proc_requisition_number UNIQUE (number),
        CONSTRAINT fk_proc_requisition_requested_by FOREIGN KEY (requested_by)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_requisition_department_id FOREIGN KEY (department_id)
          REFERENCES app.usr_department(id) ON DELETE RESTRICT,
        CONSTRAINT ck_proc_requisition_status CHECK (status IN
          ('DRAFT','SUBMITTED','PENDING_APPROVAL','APPROVED','REJECTED','CONVERTED','CANCELLED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.proc_requisition_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        requisition_id uuid NOT NULL,
        item_id uuid NULL,
        free_text text NULL,
        qty numeric(14,4) NOT NULL,
        est_price numeric(18,4) NOT NULL,
        budget_line_id uuid NULL,
        CONSTRAINT fk_proc_requisition_line_requisition_id FOREIGN KEY (requisition_id)
          REFERENCES app.proc_requisition(id) ON DELETE CASCADE,
        CONSTRAINT fk_proc_requisition_line_budget_line_id FOREIGN KEY (budget_line_id)
          REFERENCES app.gl_budget_line(id) ON DELETE RESTRICT,
        CONSTRAINT ck_proc_requisition_line_qty_positive CHECK (qty > 0),
        CONSTRAINT ck_proc_requisition_line_est_price_nonneg CHECK (est_price >= 0),
        CONSTRAINT ck_proc_requisition_line_item_or_free_text CHECK (item_id IS NOT NULL OR free_text IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.proc_quotation (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        requisition_id uuid NOT NULL,
        supplier_id uuid NOT NULL,
        quote_date date NOT NULL,
        valid_until date NULL,
        document_file_id uuid NULL,
        total numeric(18,4) NOT NULL,
        terms text NULL,
        is_awarded boolean NOT NULL DEFAULT false,
        award_reason text NULL,
        CONSTRAINT fk_proc_quotation_requisition_id FOREIGN KEY (requisition_id)
          REFERENCES app.proc_requisition(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_quotation_supplier_id FOREIGN KEY (supplier_id)
          REFERENCES app.proc_supplier(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_quotation_document_file_id FOREIGN KEY (document_file_id)
          REFERENCES app.file_object(id) ON DELETE SET NULL
      )
    `);
    // DDL's own `uq_award_p (requisition_id) WHERE is_awarded` — one award per requisition.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_proc_quotation_award_p ON app.proc_quotation (requisition_id)
        WHERE is_awarded = true
    `);

    await queryRunner.query(`
      CREATE TABLE app.proc_quotation_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        quotation_id uuid NOT NULL,
        item_id uuid NULL,
        description varchar(200) NOT NULL,
        qty numeric(14,4) NOT NULL,
        unit_price numeric(18,4) NOT NULL,
        CONSTRAINT fk_proc_quotation_line_quotation_id FOREIGN KEY (quotation_id)
          REFERENCES app.proc_quotation(id) ON DELETE CASCADE,
        CONSTRAINT ck_proc_quotation_line_qty_positive CHECK (qty > 0),
        CONSTRAINT ck_proc_quotation_line_unit_price_nonneg CHECK (unit_price >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.proc_purchase_order (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        revision int NOT NULL DEFAULT 0,
        supersedes_id uuid NULL,
        supplier_id uuid NOT NULL,
        requisition_id uuid NULL,
        quotation_id uuid NULL,
        status varchar(20) NOT NULL,
        approval_ref uuid NULL,
        order_date date NOT NULL,
        delivery_terms text NULL,
        payment_terms_days int NOT NULL,
        subtotal numeric(18,4) NOT NULL DEFAULT 0,
        tax_amount numeric(18,4) NOT NULL DEFAULT 0,
        total numeric(18,4) NOT NULL DEFAULT 0,
        issued_at timestamptz NULL,
        CONSTRAINT uq_proc_purchase_order_number UNIQUE (number),
        CONSTRAINT fk_proc_purchase_order_supersedes_id FOREIGN KEY (supersedes_id)
          REFERENCES app.proc_purchase_order(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_purchase_order_supplier_id FOREIGN KEY (supplier_id)
          REFERENCES app.proc_supplier(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_purchase_order_requisition_id FOREIGN KEY (requisition_id)
          REFERENCES app.proc_requisition(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_purchase_order_quotation_id FOREIGN KEY (quotation_id)
          REFERENCES app.proc_quotation(id) ON DELETE RESTRICT,
        CONSTRAINT ck_proc_purchase_order_status CHECK (status IN
          ('DRAFT','PENDING_APPROVAL','APPROVED','ISSUED','PARTIALLY_RECEIVED','RECEIVED','CLOSED','CANCELLED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.proc_po_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        po_id uuid NOT NULL,
        line_no int NOT NULL,
        item_id uuid NULL,
        description varchar(200) NOT NULL,
        qty numeric(14,4) NOT NULL,
        unit_price numeric(18,4) NOT NULL,
        received_qty numeric(14,4) NOT NULL DEFAULT 0,
        CONSTRAINT fk_proc_po_line_po_id FOREIGN KEY (po_id)
          REFERENCES app.proc_purchase_order(id) ON DELETE CASCADE,
        CONSTRAINT ck_proc_po_line_qty_positive CHECK (qty > 0),
        CONSTRAINT ck_proc_po_line_unit_price_nonneg CHECK (unit_price >= 0),
        CONSTRAINT ck_proc_po_line_received_qty_nonneg CHECK (received_qty >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_proc_po_line_po ON app.proc_po_line (po_id)`);

    await queryRunner.query(`
      CREATE TABLE app.proc_grn (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        po_id uuid NOT NULL,
        received_by uuid NOT NULL,
        received_at timestamptz NOT NULL,
        status varchar(12) NOT NULL,
        journal_id uuid NULL,
        notes text NULL,
        CONSTRAINT uq_proc_grn_number UNIQUE (number),
        CONSTRAINT fk_proc_grn_po_id FOREIGN KEY (po_id)
          REFERENCES app.proc_purchase_order(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_grn_received_by FOREIGN KEY (received_by)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_grn_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_proc_grn_status CHECK (status IN ('DRAFT','POSTED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_proc_grn_po ON app.proc_grn (po_id)`);

    await queryRunner.query(`
      CREATE TABLE app.proc_grn_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        grn_id uuid NOT NULL,
        po_line_id uuid NOT NULL,
        received_qty numeric(14,4) NOT NULL,
        rejected_qty numeric(14,4) NOT NULL DEFAULT 0,
        rejection_reason text NULL,
        unit_cost numeric(18,4) NOT NULL,
        CONSTRAINT fk_proc_grn_line_grn_id FOREIGN KEY (grn_id)
          REFERENCES app.proc_grn(id) ON DELETE CASCADE,
        CONSTRAINT fk_proc_grn_line_po_line_id FOREIGN KEY (po_line_id)
          REFERENCES app.proc_po_line(id) ON DELETE RESTRICT,
        CONSTRAINT ck_proc_grn_line_received_qty_positive CHECK (received_qty > 0),
        CONSTRAINT ck_proc_grn_line_rejected_qty_nonneg CHECK (rejected_qty >= 0),
        CONSTRAINT ck_proc_grn_line_unit_cost_nonneg CHECK (unit_cost >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_proc_grn_line_po_line ON app.proc_grn_line (po_line_id)`);

    await queryRunner.query(`
      CREATE TABLE app.proc_supplier_invoice (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        supplier_ref varchar(60) NOT NULL,
        supplier_id uuid NOT NULL,
        po_id uuid NULL,
        invoice_date date NOT NULL,
        due_date date NOT NULL,
        total numeric(18,4) NOT NULL,
        status varchar(15) NOT NULL,
        match_variance jsonb NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        paid_amount numeric(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT uq_proc_supplier_invoice_number UNIQUE (number),
        CONSTRAINT fk_proc_supplier_invoice_supplier_id FOREIGN KEY (supplier_id)
          REFERENCES app.proc_supplier(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_supplier_invoice_po_id FOREIGN KEY (po_id)
          REFERENCES app.proc_purchase_order(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_supplier_invoice_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_proc_supplier_invoice_status CHECK (status IN
          ('UNMATCHED','MATCH_EXCEPTION','MATCHED','POSTED','PAID','PARTIALLY_PAID')),
        CONSTRAINT ck_proc_supplier_invoice_total_positive CHECK (total > 0)
      )
    `);
    // DDL's own `ix_proc_inv_supplier_open (supplier_id) WHERE status IN ('POSTED','PARTIALLY_PAID')` — BR-PROC-04.
    await queryRunner.query(`
      CREATE INDEX ix_proc_inv_supplier_open ON app.proc_supplier_invoice (supplier_id)
        WHERE status IN ('POSTED','PARTIALLY_PAID')
    `);

    await queryRunner.query(`
      CREATE TABLE app.proc_payment_voucher (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        supplier_id uuid NOT NULL,
        method varchar(10) NOT NULL,
        bank_account_id uuid NULL,
        cheque_leaf_id uuid NULL,
        total numeric(18,4) NOT NULL,
        status varchar(20) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        remittance_sent boolean NOT NULL DEFAULT false,
        CONSTRAINT uq_proc_payment_voucher_number UNIQUE (number),
        CONSTRAINT fk_proc_payment_voucher_supplier_id FOREIGN KEY (supplier_id)
          REFERENCES app.proc_supplier(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_payment_voucher_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_proc_payment_voucher_method CHECK (method IN ('BANK','CHEQUE','MPESA','CASH')),
        CONSTRAINT ck_proc_payment_voucher_status CHECK (status IN
          ('DRAFT','PENDING_APPROVAL','APPROVED','PAID','CANCELLED')),
        CONSTRAINT ck_proc_payment_voucher_total_positive CHECK (total > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE app.proc_voucher_allocation (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        voucher_id uuid NOT NULL,
        supplier_invoice_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        CONSTRAINT fk_proc_voucher_allocation_voucher_id FOREIGN KEY (voucher_id)
          REFERENCES app.proc_payment_voucher(id) ON DELETE CASCADE,
        CONSTRAINT fk_proc_voucher_allocation_supplier_invoice_id FOREIGN KEY (supplier_invoice_id)
          REFERENCES app.proc_supplier_invoice(id) ON DELETE RESTRICT,
        CONSTRAINT ck_proc_voucher_allocation_amount_positive CHECK (amount > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_proc_voucher_allocation_supplier_invoice ON app.proc_voucher_allocation (supplier_invoice_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE app.proc_contract (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        supplier_id uuid NOT NULL,
        title varchar(160) NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        value numeric(18,4) NULL,
        renewal_alert_days int NOT NULL DEFAULT 30,
        document_file_id uuid NULL,
        status varchar(12) NOT NULL,
        CONSTRAINT fk_proc_contract_supplier_id FOREIGN KEY (supplier_id)
          REFERENCES app.proc_supplier(id) ON DELETE RESTRICT,
        CONSTRAINT fk_proc_contract_document_file_id FOREIGN KEY (document_file_id)
          REFERENCES app.file_object(id) ON DELETE SET NULL,
        CONSTRAINT ck_proc_contract_status CHECK (status IN ('ACTIVE','EXPIRED','TERMINATED')),
        CONSTRAINT ck_proc_contract_dates CHECK (ends_on >= starts_on)
      )
    `);

    // --- Trigger 1: trg_proc_po_immutable (FR-PROC-004.1) ------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_proc_po_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED') THEN
          IF NEW.subtotal <> OLD.subtotal
             OR NEW.tax_amount <> OLD.tax_amount
             OR NEW.total <> OLD.total
             OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
            RAISE EXCEPTION 'FR-PROC-004.1: purchase order % is immutable once status=% (ISSUED or beyond) — a revision must create a new PO row via supersedes_id, never edit in place',
              OLD.id, OLD.status
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_proc_po_immutable
        BEFORE UPDATE ON app.proc_purchase_order
        FOR EACH ROW EXECUTE FUNCTION app.fn_proc_po_immutable()
    `);

    // --- Trigger 2: trg_proc_grn_qty_cap (BR-PROC-03) -----------------------
    await queryRunner.query(`
      CREATE FUNCTION app.fn_proc_grn_qty_cap() RETURNS trigger AS $$
      DECLARE
        v_po_qty numeric(14,4);
        v_existing_sum numeric(14,4);
        v_new_total numeric(14,4);
        v_tolerance CONSTANT numeric(5,4) := 0.05;
      BEGIN
        SELECT qty INTO v_po_qty FROM app.proc_po_line WHERE id = NEW.po_line_id;
        IF v_po_qty IS NULL THEN
          RAISE EXCEPTION 'proc_grn_line.po_line_id % does not reference an existing proc_po_line', NEW.po_line_id
            USING ERRCODE = '23503';
        END IF;

        SELECT COALESCE(SUM(received_qty), 0) INTO v_existing_sum
          FROM app.proc_grn_line
          WHERE po_line_id = NEW.po_line_id
            AND id <> NEW.id;

        v_new_total := v_existing_sum + NEW.received_qty;

        IF v_new_total > v_po_qty * (1 + v_tolerance) THEN
          RAISE EXCEPTION 'BR-PROC-03: cumulative received qty % for PO line % would exceed outstanding qty % plus the % hard tolerance ceiling',
            v_new_total, NEW.po_line_id, v_po_qty, v_tolerance
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_proc_grn_qty_cap
        BEFORE INSERT OR UPDATE ON app.proc_grn_line
        FOR EACH ROW EXECUTE FUNCTION app.fn_proc_grn_qty_cap()
    `);

    // --- Trigger 3: trg_proc_voucher_allocation_sum (BR-PROC-04, sum half) -
    await queryRunner.query(`
      CREATE FUNCTION app.fn_proc_voucher_allocation_sum() RETURNS trigger AS $$
      DECLARE
        v_voucher_id uuid;
        v_allocation_sum numeric(18,4);
        v_voucher_total numeric(18,4);
      BEGIN
        IF TG_OP = 'DELETE' THEN
          v_voucher_id := OLD.voucher_id;
        ELSE
          v_voucher_id := NEW.voucher_id;
        END IF;

        SELECT COALESCE(SUM(amount), 0) INTO v_allocation_sum
          FROM app.proc_voucher_allocation
          WHERE voucher_id = v_voucher_id;

        SELECT total INTO v_voucher_total FROM app.proc_payment_voucher WHERE id = v_voucher_id;

        IF v_voucher_total IS NOT NULL AND v_allocation_sum <> v_voucher_total THEN
          RAISE EXCEPTION 'BR-PROC-04: voucher % allocations sum to % but voucher total is %',
            v_voucher_id, v_allocation_sum, v_voucher_total
            USING ERRCODE = '23514';
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER trg_proc_voucher_allocation_sum
        AFTER INSERT OR UPDATE OR DELETE ON app.proc_voucher_allocation
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION app.fn_proc_voucher_allocation_sum()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_proc_voucher_allocation_sum ON app.proc_voucher_allocation`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_proc_voucher_allocation_sum()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_proc_grn_qty_cap ON app.proc_grn_line`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_proc_grn_qty_cap()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_proc_po_immutable ON app.proc_purchase_order`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_proc_po_immutable()`);

    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_contract`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_voucher_allocation`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_payment_voucher`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_supplier_invoice`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_grn_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_grn`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_po_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_purchase_order`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_quotation_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_quotation`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_requisition_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_requisition`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.proc_supplier`);
  }
}
