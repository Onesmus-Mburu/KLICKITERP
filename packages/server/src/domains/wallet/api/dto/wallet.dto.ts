import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsIn, IsOptional, IsString, Matches } from "class-validator";
import { WALL_SERVICE_POINT_TYPES } from "../../domain/wall-service-point.entity";
import { WALL_WALLET_STATUSES } from "../../domain/wall-wallet.entity";

const DECIMAL_STRING_PATTERN = /^\d+(\.\d{1,4})?$/;

export class UpdateWalletLimitsDto {
  @ApiPropertyOptional({ type: String, description: "Decimal string, null clears the limit" })
  @IsOptional()
  @Matches(DECIMAL_STRING_PATTERN)
  dailyLimit?: string | null;

  @ApiPropertyOptional({ type: String, description: "Decimal string, null clears the limit" })
  @IsOptional()
  @Matches(DECIMAL_STRING_PATTERN)
  txnLimit?: string | null;

  @ApiPropertyOptional({ enum: WALL_SERVICE_POINT_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(WALL_SERVICE_POINT_TYPES, { each: true })
  categoryBlocks?: string[];
}

export class SetWalletStatusDto {
  @ApiProperty({ enum: WALL_WALLET_STATUSES.filter((s) => s !== "CLOSED") })
  @IsIn(WALL_WALLET_STATUSES.filter((s) => s !== "CLOSED"))
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class WalletResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ enum: WALL_WALLET_STATUSES })
  status!: string;

  @ApiProperty({ type: String })
  balance!: string;

  @ApiProperty({ type: String })
  overdraftLimit!: string;

  @ApiProperty({ type: String, nullable: true })
  dailyLimit!: string | null;

  @ApiProperty({ type: String, nullable: true })
  txnLimit!: string | null;

  @ApiProperty({ type: [String] })
  categoryBlocks!: string[];

  @ApiProperty({ type: String, nullable: true })
  statusReason!: string | null;
}

/**
 * Phase 6 Slice 11 (Part 2) — the new Wallets list screen's row shape:
 * `WalletResponseDto`'s own fields plus the joined student's
 * `studentId`/`admissionNo`/`studentName`, mirroring
 * `PendingUpcomingInvoiceResponseDto`'s (`domains/billing/api/dto/invoice.dto.ts`,
 * Slice 8 Part 2) established student-join-fields shape exactly.
 */
export class WalletListItemResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty()
  admissionNo!: string;

  @ApiProperty()
  studentName!: string;

  @ApiProperty({ enum: WALL_WALLET_STATUSES })
  status!: string;

  @ApiProperty({ type: String })
  balance!: string;

  @ApiProperty({ type: String })
  overdraftLimit!: string;

  @ApiProperty({ type: String, nullable: true })
  dailyLimit!: string | null;

  @ApiProperty({ type: String, nullable: true })
  txnLimit!: string | null;
}

export class WalletListResponseDto {
  @ApiProperty({ type: [WalletListItemResponseDto] })
  items!: WalletListItemResponseDto[];

  @ApiProperty({ description: "Total row count matching the applied filters, ignoring page/pageSize" })
  total!: number;
}
