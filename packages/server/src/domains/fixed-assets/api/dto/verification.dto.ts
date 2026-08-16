import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  isUUID,
} from "class-validator";
import { FA_VERIFICATION_STATUSES } from "../../domain/fa-verification.entity";

/**
 * Bug fix (Phase 6 Slice 23 Part 5, see docs/phase-6/PROGRESS.md): before
 * this decorator existed, `assetIds` carried NO class-validator decorators
 * at all — the identical bug shape `domains/inventory/api/dto/stock-take.dto.ts`'s
 * own `IsAllOrUuidArrayConstraint` doc comment already flagged as existing
 * here, left unfixed at the time (Phase 6 Slice 19 Part 3), "for whenever
 * Fixed Assets gets its own frontend pass" — that pass is this one. The
 * global `ValidationPipe` (`apps/api/src/app.module.ts`) runs with
 * `whitelist: true`, and because `CreateFaVerificationDto.scope` is
 * validated via `@ValidateNested()` + `@Type(() => FaVerificationScopeDto)`,
 * class-validator recurses into this class and — per its own documented
 * whitelist behavior — silently STRIPS any property with zero validation
 * decorators before the transformed object ever reaches the controller.
 * That made every real `POST /fixed-assets/verifications` call crash with a
 * raw 500 (`Cannot read properties of undefined (reading 'length')`/
 * `(reading '===')` in `VerificationService.createSession`, which reads
 * `scope.assetIds.length`/`scope.assetIds === "ALL"`) — confirmed live via
 * the running server's own logged stack trace before this fix, not guessed.
 * `assetIds` is a bare union (`string[] | "ALL"`) with no built-in
 * class-validator decorator for that shape, so a small custom constraint is
 * the minimal fix: it both stops the whitelist strip (any registered
 * decorator does) AND gives the field real validation instead of a crash.
 * A LOCAL duplicate of Inventory's own constraint, not a cross-module
 * import — `domains/fixed-assets`'s own `mayImport` list
 * (`packages/config/eslint/module-deps.json`) does not include
 * `domains/inventory`, and `IsAllOrUuidArrayConstraint` there is an
 * unexported, file-local class regardless. Uses a DISTINCT
 * `@ValidatorConstraint({ name: ... })` from Inventory's own
 * `"isAllOrUuidArray"` — class-validator constraint names are process-global
 * (both modules load into the same one `apps/api` process), so a name
 * collision here could throw a confusing runtime error.
 */
@ValidatorConstraint({ name: "isAllOrUuidArrayFixedAssets", async: false })
class IsAllOrUuidArrayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === "ALL") return true;
    return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && isUUID(v));
  }
  defaultMessage(): string {
    return "assetIds must be either the literal string 'ALL' or a non-empty array of asset UUIDs";
  }
}

export class FaVerificationScopeDto {
  @ApiProperty({
    description: "'ALL' (every currently ACTIVE asset) or an explicit array of asset ids — see verification.service.ts's FaVerificationScope doc comment",
    oneOf: [{ type: "string", enum: ["ALL"] }, { type: "array", items: { type: "string", format: "uuid" } }],
  })
  @Validate(IsAllOrUuidArrayConstraint)
  assetIds!: string[] | "ALL";
}

export class CreateFaVerificationDto {
  @ApiProperty({ type: FaVerificationScopeDto })
  @ValidateNested()
  @Type(() => FaVerificationScopeDto)
  scope!: FaVerificationScopeDto;
}

export class RecordVerificationCountDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  lineId!: string;

  @ApiProperty()
  @IsBoolean()
  found!: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordVerificationCountsDto {
  @ApiProperty({ type: [RecordVerificationCountDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RecordVerificationCountDto)
  counts!: RecordVerificationCountDto[];
}

export class DecideFaVerificationDto {
  @ApiProperty({ enum: ["APPROVE", "RETURN"] })
  @IsIn(["APPROVE", "RETURN"])
  decision!: "APPROVE" | "RETURN";
}

export class FaVerificationResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ type: Object })
  scope!: Record<string, unknown>;

  @ApiProperty()
  snapshotAt!: Date;

  @ApiProperty({ enum: FA_VERIFICATION_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}

export class FaVerificationLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  verificationId!: string;

  @ApiProperty({ format: "uuid" })
  assetId!: string;

  @ApiProperty()
  found!: boolean;

  @ApiProperty({ nullable: true })
  condition!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;
}

export class PostFaVerificationResponseDto {
  @ApiProperty({ type: FaVerificationResponseDto })
  verification!: FaVerificationResponseDto;

  @ApiProperty({ type: [String], format: "uuid", description: "Missing-asset write-off proposals — asset ids with found=false at post time. Act on each via POST /fixed-assets/disposals with method=WRITE_OFF." })
  missingAssetIds!: string[];
}
