import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Slice 12 (Part D — Credit Balance Forward backend). Extends
 * `ck_pay_receipt_split_method` (migration `0080`) with a new value,
 * `'CREDIT_BALANCE'` — the split method for a receipt created by
 * `ReceiptsService.applyStudentCreditToInvoices()`, mirroring `'WALLET'`'s
 * own precedent (declared as a real `PayReceiptSplitMethod` union member and
 * `PAY_RECEIPT_SPLIT_METHODS` array entry — see `pay-receipt-split.entity.ts`
 * — well before this migration existed, exactly as `'WALLET'` sat
 * declared-but-unused from the Module 10 foundation pass until Phase 6 Slice
 * 12 Part A actually produced a `WALLET`-method receipt).
 *
 * No column-width change needed: `pay_receipt_split.method` is `varchar(15)`
 * (migration `0080`) and `'CREDIT_BALANCE'` is 14 characters — fits with room
 * to spare, confirmed directly against the real DDL before writing this
 * migration (not assumed).
 */
export class ExtendPayReceiptSplitMethodCheck0234 implements MigrationInterface {
  name = "ExtendPayReceiptSplitMethodCheck1700000000234";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.pay_receipt_split DROP CONSTRAINT ck_pay_receipt_split_method`);
    await queryRunner.query(`
      ALTER TABLE app.pay_receipt_split ADD CONSTRAINT ck_pay_receipt_split_method
        CHECK (method IN ('CASH','BANK','CHEQUE','CARD','POS','MPESA_STK','MPESA_C2B','MPESA_TILL','WALLET','BANK_TRANSFER','CREDIT_BALANCE'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Irreversible in the strict sense once a real CREDIT_BALANCE split row
    // exists (re-adding the narrower CHECK against data that violates it
    // fails outright) — the correct behavior, matching migration `0233`'s own
    // documented precedent for this exact class of down().
    await queryRunner.query(`ALTER TABLE app.pay_receipt_split DROP CONSTRAINT ck_pay_receipt_split_method`);
    await queryRunner.query(`
      ALTER TABLE app.pay_receipt_split ADD CONSTRAINT ck_pay_receipt_split_method
        CHECK (method IN ('CASH','BANK','CHEQUE','CARD','POS','MPESA_STK','MPESA_C2B','MPESA_TILL','WALLET','BANK_TRANSFER'))
    `);
  }
}
