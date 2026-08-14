import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  isUUID,
} from "class-validator";
import { INV_STOCK_TAKE_STATUSES } from "../../domain/inv-stock-take.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

/**
 * Bug fix (Phase 6 Slice 19 Part 3, see docs/phase-6/PROGRESS.md): before this
 * decorator existed, `itemIds` carried NO class-validator decorators at all.
 * The global `ValidationPipe` (`apps/api/src/app.module.ts`) runs with
 * `whitelist: true`, and because `CreateStockTakeDto.scope` is validated via
 * `@ValidateNested()` + `@Type(() => StockTakeScopeDto)`, class-validator
 * recurses into this class and — per its own documented whitelist behavior —
 * silently STRIPS any property with zero validation decorators before the
 * transformed object ever reaches the controller. That made every real
 * `POST /inventory/stock-takes` call crash with a raw 500 (`Cannot read
 * properties of undefined (reading 'length')` in
 * `StockTakesService.createSession`, which reads `scope.itemIds.length`) —
 * confirmed live via the running server's own logged stack trace, not
 * guessed. `itemIds` is a bare union (`string[] | "ALL"`) with no built-in
 * class-validator decorator for that shape, so a small custom constraint is
 * the minimal fix: it both stops the whitelist strip (any registered
 * decorator does) AND gives the field real validation instead of a crash.
 * The identical bug shape (`assetIds: string[] | "ALL"` with zero decorators)
 * also exists in `domains/fixed-assets/api/dto/verification.dto.ts`'s
 * `FaVerificationScopeDto` — left unfixed, out of this part's scope.
 */
@ValidatorConstraint({ name: "isAllOrUuidArray", async: false })
class IsAllOrUuidArrayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === "ALL") return true;
    return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && isUUID(v));
  }
  defaultMessage(): string {
    return "itemIds must be either the literal string 'ALL' or a non-empty array of item UUIDs";
  }
}

export class StockTakeScopeDto {
  @ApiProperty({
    description: "'ALL' (every item with a tracked balance at this store) or an explicit array of item ids — see stock-take-scope.util.ts",
    oneOf: [{ type: "string", enum: ["ALL"] }, { type: "array", items: { type: "string", format: "uuid" } }],
  })
  @Validate(IsAllOrUuidArrayConstraint)
  itemIds!: string[] | "ALL";
}

export class CreateStockTakeDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  storeId!: string;

  @ApiProperty({ type: StockTakeScopeDto })
  @ValidateNested()
  @Type(() => StockTakeScopeDto)
  scope!: StockTakeScopeDto;
}

export class RecordCountDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  lineId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  countedQty!: string;
}

export class RecordCountsDto {
  @ApiProperty({ type: [RecordCountDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RecordCountDto)
  counts!: RecordCountDto[];
}

export class DecideStockTakeDto {
  @ApiProperty({ enum: ["APPROVE", "RETURN"] })
  @IsString()
  @IsIn(["APPROVE", "RETURN"])
  decision!: "APPROVE" | "RETURN";
}

export class StockTakeResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  storeId!: string;

  @ApiProperty({ type: Object })
  scope!: Record<string, unknown>;

  @ApiProperty()
  snapshotAt!: Date;

  @ApiProperty({ enum: INV_STOCK_TAKE_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}

export class StockTakeLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  stockTakeId!: string;

  @ApiProperty({ format: "uuid" })
  itemId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  snapshotQty!: string;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string" })
  countedQty!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string, generated (counted_qty - snapshot_qty)" })
  varianceQty!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: "Decimal string" })
  varianceValue?: string | null;
}
