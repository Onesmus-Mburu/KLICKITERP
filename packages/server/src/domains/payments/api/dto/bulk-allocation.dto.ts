import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsObject, IsString, IsUUID, Matches, MaxLength, ValidateNested } from "class-validator";
import { PAY_BULK_ALLOCATION_BATCH_STATUSES } from "../../domain/pay-bulk-allocation-batch.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateBulkAllocationLineDto {
  @ApiProperty({ maxLength: 30 })
  @IsString()
  @MaxLength(30)
  admissionNo!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;
}

export class CreateBulkAllocationBatchDto {
  @ApiProperty({ type: Object, description: "Opaque uploaded-instrument payload (e.g. a parsed bank statement/M-Pesa bulk-payment row set)" })
  @IsObject()
  instrument!: Record<string, unknown>;

  @ApiProperty({ type: [CreateBulkAllocationLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateBulkAllocationLineDto)
  lines!: CreateBulkAllocationLineDto[];

  @ApiProperty({ format: "uuid", description: "Real bank_account this whole batch's lines are captured against as BANK_TRANSFER splits (Phase 6 Slice 7 fix — was previously a fabricated non-FK string)" })
  @IsUUID()
  bankAccountId!: string;
}

export class BulkAllocationBatchResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: Object })
  instrument!: Record<string, unknown>;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;

  @ApiProperty({ enum: PAY_BULK_ALLOCATION_BATCH_STATUSES })
  status!: string;

  @ApiProperty()
  createdReceipts!: number;

  @ApiProperty({ format: "uuid" })
  bankAccountId!: string;
}

export class BulkAllocationBatchLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  batchId!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  receiptId!: string | null;
}
