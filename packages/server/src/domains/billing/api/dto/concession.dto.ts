import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { BILL_CONCESSION_KINDS, BillConcessionKind } from "../../domain/bill-concession-scheme.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class RequestConcessionDto {
  @ApiProperty({ enum: BILL_CONCESSION_KINDS })
  @IsIn(BILL_CONCESSION_KINDS)
  kind!: BillConcessionKind;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  schemeId?: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  invoiceLineId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  sponsorAwardId?: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiProperty()
  @IsString()
  reason!: string;
}

export class DecideConcessionDto {
  @ApiProperty()
  @IsBoolean()
  approved!: boolean;
}

export class ConcessionResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: BILL_CONCESSION_KINDS })
  kind!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  schemeId!: string | null;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  invoiceId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  invoiceLineId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  sponsorAwardId!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}
