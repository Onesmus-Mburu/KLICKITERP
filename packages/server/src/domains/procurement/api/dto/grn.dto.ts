import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, Matches, ValidateNested } from "class-validator";
import { PROC_GRN_STATUSES } from "../../domain/proc-grn.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class ReceiveGrnLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  poLineId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  receivedQty!: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string, defaults to 0" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  rejectedQty?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  unitCost!: string;
}

export class ReceiveGrnDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  poId!: string;

  @ApiProperty({ type: [ReceiveGrnLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReceiveGrnLineDto)
  lines!: ReceiveGrnLineDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class GrnResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  poId!: string;

  @ApiProperty({ format: "uuid" })
  receivedBy!: string;

  @ApiProperty()
  receivedAt!: Date;

  @ApiProperty({ enum: PROC_GRN_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;
}

export class GrnLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  grnId!: string;

  @ApiProperty({ format: "uuid" })
  poLineId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  receivedQty!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  rejectedQty!: string;

  @ApiProperty({ nullable: true })
  rejectionReason!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  unitCost!: string;
}
