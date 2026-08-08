import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { PROC_REQUISITION_STATUSES } from "../../domain/proc-requisition.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateRequisitionDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  departmentId!: string;

  @ApiProperty()
  @IsString()
  justification!: string;
}

export class CreateRequisitionLineDto {
  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Forward reference to inv_item (Module 13/Inventory) — bare uuid, no FK yet" })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  freeText?: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  estPrice!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  budgetLineId?: string;
}

export class UpdateRequisitionLineDto {
  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  freeText?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  qty?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  estPrice?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  budgetLineId?: string;
}

export class RequisitionResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  requestedBy!: string;

  @ApiProperty({ format: "uuid" })
  departmentId!: string;

  @ApiProperty()
  justification!: string;

  @ApiProperty({ enum: PROC_REQUISITION_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true, nullable: true, description: "BR-PROC-02 budget snapshot captured at submit()" })
  budgetSnapshot!: Record<string, unknown> | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  totalEstimate!: string;
}

export class RequisitionLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  requisitionId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  itemId!: string | null;

  @ApiProperty({ nullable: true })
  freeText!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  estPrice!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  budgetLineId!: string | null;
}
