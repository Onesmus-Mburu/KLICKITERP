import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, IsUUID, Matches } from "class-validator";
import { BANK_RECONCILIATION_STATUSES } from "../../domain/bank-reconciliation.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class StartReconciliationDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  periodId!: string;
}

export class ManualMatchDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  statementLineId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  journalLineId!: string;
}

export class CreateAdjustmentDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  statementLineId!: string;

  @ApiProperty({ enum: ["CHARGE", "INTEREST"] })
  @IsIn(["CHARGE", "INTEREST"])
  kind!: "CHARGE" | "INTEREST";

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;
}

export class ReopenReconciliationDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class AutoMatchSuggestionDto {
  @ApiProperty({ format: "uuid" })
  statementLineId!: string;

  @ApiProperty({ format: "uuid" })
  journalLineId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;
}

export class AutoMatchResultDto {
  @ApiProperty()
  pass1Matches!: number;

  @ApiProperty()
  pass2Matches!: number;

  @ApiProperty({ type: [AutoMatchSuggestionDto] })
  suggestions!: AutoMatchSuggestionDto[];
}

export class BankReconciliationResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  accountId!: string;

  @ApiProperty({ format: "uuid" })
  periodId!: string;

  @ApiProperty({ enum: BANK_RECONCILIATION_STATUSES })
  status!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  bookBalance!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  bankBalance!: string;

  @ApiProperty({ type: Object })
  outstanding!: Record<string, unknown>;

  @ApiProperty({ format: "uuid", nullable: true })
  lockedBy!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  lockedAt!: Date | null;
}

export class BankReconMatchResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  reconciliationId!: string;

  @ApiProperty({ format: "uuid" })
  statementLineId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  journalLineId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  adjustmentJournalId!: string | null;
}
