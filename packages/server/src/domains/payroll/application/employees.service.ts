import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { decryptFromBuffer, encryptToBuffer } from "../../../shared/crypto/aes-gcm.util";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { PyrlEmployeeEntity, PyrlEmploymentType } from "../domain/pyrl-employee.entity";
import { ListPyrlEmployeesFilter, PyrlEmployeeRepository } from "../infrastructure/pyrl-employee.repository";

/** Placeholder shown in place of an encrypted field's real value by `get()`/`list()`/`search()` — mirrors `SettingsService`'s `REDACTED_SECRET_VALUE` precedent. Never the real ciphertext or plaintext. */
const REDACTED_VALUE = "***";

export interface CreatePyrlEmployeeInput {
  staffNo: string;
  userId?: string | null;
  fullName: string;
  nationalId: string;
  kraPin: string;
  nssfNo?: string | null;
  shifNo?: string | null;
  employmentType: PyrlEmploymentType;
  departmentId: string;
  jobTitle: string;
  hireDate: string;
  costCenterId: string;
  /** Opaque plaintext — encrypted before ever reaching the repository. `undefined` leaves it NULL. */
  payDetails?: unknown;
  bankName?: unknown;
  branch?: unknown;
  account?: unknown;
}

export interface UpdatePyrlEmployeeInput {
  fullName?: string;
  jobTitle?: string;
  departmentId?: string;
  costCenterId?: string;
  employmentType?: PyrlEmploymentType;
  nssfNo?: string | null;
  shifNo?: string | null;
  userId?: string | null;
  /**
   * Opaque plaintext — `undefined` leaves the stored (encrypted) value
   * untouched; `null` clears it; any other value re-encrypts and replaces it.
   */
  payDetails?: unknown;
  bankName?: unknown;
  branch?: unknown;
  account?: unknown;
}

/**
 * CRUD for `pyrl_employee` — the payroll employee master (Module 15 PASS A).
 *
 * **Encrypted columns** (`pay_details`/`bank_name`/`branch`/`account`,
 * `pyrl_employee.entity.ts`'s own "(enc)" markers): encrypted on write,
 * decrypted only by `getDecrypted()`. Follows `SettingsService.encode()`/
 * `.decode()`'s exact precedent (the ONLY other envelope-encryption consumer
 * of `shared/crypto/aes-gcm.util.ts` in this codebase) bit-for-bit: `encode`
 * = `encryptToBuffer(JSON.stringify(value), key).toString("base64")` (the
 * base64 STRING is what's stored in the `jsonb` column, matching the
 * entity's own doc comment on why `jsonb`-of-base64-string was chosen over
 * `bytea`); `decode` = `JSON.parse(decryptFromBuffer(Buffer.from(stored,
 * "base64"), key))`.
 *
 * **Access-control judgement call (FR-PYRL-012.1 — "payroll data isolation
 * ... audit entries for payroll store amounts encrypted, visible only to
 * payroll-permissioned auditors")**: this pass has no controllers, so no
 * real permission-scoped redaction can be wired yet. The service itself
 * still draws a line: `get()`/`list()`/`search()` — the "default", broadly
 * reachable read paths — return the encrypted fields REDACTED (`"***"`,
 * mirrors `SettingsService.list()`'s `REDACTED_SECRET_VALUE` precedent),
 * never the ciphertext and never the plaintext. `getDecrypted()` is a
 * separate, deliberately-named method that returns real plaintext bank/pay
 * details — a Pass B controller MUST gate this behind a dedicated
 * payroll-sensitive-data permission code (permission catalogue is
 * explicitly out of scope for this pass) before ever exposing it over HTTP.
 * This mirrors the same "service draws the line, controller enforces it"
 * split `FilesService`/`ThemesService` already establish elsewhere in this
 * codebase.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly employeeRepository: PyrlEmployeeRepository,
    private readonly config: AppConfigService,
  ) {}

  async create(input: CreatePyrlEmployeeInput, actorId: string | null): Promise<PyrlEmployeeEntity> {
    const created = await this.employeeRepository.create({
      staffNo: input.staffNo,
      userId: input.userId ?? null,
      fullName: input.fullName,
      nationalId: input.nationalId,
      kraPin: input.kraPin,
      nssfNo: input.nssfNo ?? null,
      shifNo: input.shifNo ?? null,
      employmentType: input.employmentType,
      departmentId: input.departmentId,
      jobTitle: input.jobTitle,
      hireDate: input.hireDate,
      exitDate: null,
      payDetails: this.encodeField(input.payDetails),
      bankName: this.encodeField(input.bankName),
      branch: this.encodeField(input.branch),
      account: this.encodeField(input.account),
      costCenterId: input.costCenterId,
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return this.redact(created);
  }

  async update(id: string, input: UpdatePyrlEmployeeInput, actorId: string | null): Promise<PyrlEmployeeEntity> {
    const row = await this.employeeRepository.findByIdOrFail(id);
    if (input.fullName !== undefined) row.fullName = input.fullName;
    if (input.jobTitle !== undefined) row.jobTitle = input.jobTitle;
    if (input.departmentId !== undefined) row.departmentId = input.departmentId;
    if (input.costCenterId !== undefined) row.costCenterId = input.costCenterId;
    if (input.employmentType !== undefined) row.employmentType = input.employmentType;
    if (input.nssfNo !== undefined) row.nssfNo = input.nssfNo;
    if (input.shifNo !== undefined) row.shifNo = input.shifNo;
    if (input.userId !== undefined) row.userId = input.userId;
    if (input.payDetails !== undefined) row.payDetails = this.encodeField(input.payDetails);
    if (input.bankName !== undefined) row.bankName = this.encodeField(input.bankName);
    if (input.branch !== undefined) row.branch = this.encodeField(input.branch);
    if (input.account !== undefined) row.account = this.encodeField(input.account);
    row.updatedBy = actorId;
    const saved = await this.employeeRepository.save(row);
    return this.redact(saved);
  }

  /** Redacted read — the default, broadly-reachable lookup. See class doc comment. */
  async get(id: string): Promise<PyrlEmployeeEntity> {
    return this.redact(await this.employeeRepository.findByIdOrFail(id));
  }

  /** Decrypts `pay_details`/`bank_name`/`branch`/`account` — a Pass B controller must permission-gate this. See class doc comment. */
  async getDecrypted(id: string): Promise<PyrlEmployeeEntity> {
    const row = await this.employeeRepository.findByIdOrFail(id);
    return {
      ...row,
      payDetails: this.decodeField(row.payDetails),
      bankName: this.decodeField(row.bankName),
      branch: this.decodeField(row.branch),
      account: this.decodeField(row.account),
    } as PyrlEmployeeEntity;
  }

  async list(filter: ListPyrlEmployeesFilter = {}): Promise<PyrlEmployeeEntity[]> {
    const rows = await this.employeeRepository.list(filter);
    return rows.map((row) => this.redact(row));
  }

  /** Trigram name search (`PyrlEmployeeRepository.searchByName()`) — redacted, see class doc comment. */
  async search(query: string, limit = 20): Promise<PyrlEmployeeEntity[]> {
    if (!query.trim()) {
      throw new ValidationException("search query must not be blank");
    }
    const rows = await this.employeeRepository.searchByName(query, limit);
    return rows.map((row) => this.redact(row));
  }

  /** BR-PYRL-04's exit marker — `is_active=false`, `exit_date` set. Mid-period proration is Pass B's run-computation concern, not this service's. */
  async exit(employeeId: string, exitDate: string): Promise<PyrlEmployeeEntity> {
    const row = await this.employeeRepository.findByIdOrFail(employeeId);
    row.isActive = false;
    row.exitDate = exitDate;
    return this.redact(await this.employeeRepository.save(row));
  }

  private encodeField(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return encryptToBuffer(JSON.stringify(value), this.config.appEncryptionKeyBase64).toString("base64");
  }

  private decodeField(stored: unknown): unknown {
    if (stored === null || stored === undefined) return null;
    const ciphertext = Buffer.from(stored as string, "base64");
    return JSON.parse(decryptFromBuffer(ciphertext, this.config.appEncryptionKeyBase64));
  }

  private redact(row: PyrlEmployeeEntity): PyrlEmployeeEntity {
    return {
      ...row,
      payDetails: row.payDetails ? REDACTED_VALUE : null,
      bankName: row.bankName ? REDACTED_VALUE : null,
      branch: row.branch ? REDACTED_VALUE : null,
      account: row.account ? REDACTED_VALUE : null,
    } as PyrlEmployeeEntity;
  }
}
