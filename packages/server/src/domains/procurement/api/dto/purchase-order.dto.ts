import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from "class-validator";
import { PROC_PURCHASE_ORDER_STATUSES } from "../../domain/proc-purchase-order.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class PurchaseOrderLineDto {
  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  unitPrice!: string;
}

export class CreatePurchaseOrderDto {
  @ApiPropertyOptional({ format: "uuid", description: "Required on the requisition-based endpoint; ignored on the direct-create endpoint" })
  @IsOptional()
  @IsUUID()
  requisitionId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  quotationId?: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  deliveryTerms?: string;

  @ApiProperty({ type: [PurchaseOrderLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
}

export class RevisePurchaseOrderDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  deliveryTerms?: string;

  @ApiPropertyOptional({ type: [PurchaseOrderLineDto], description: "Omit to carry the original PO's lines forward unchanged" })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];
}

export class PurchaseOrderResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty()
  revision!: number;

  @ApiProperty({ format: "uuid", nullable: true })
  supersedesId!: string | null;

  @ApiProperty({ format: "uuid" })
  supplierId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  requisitionId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  quotationId!: string | null;

  @ApiProperty({ enum: PROC_PURCHASE_ORDER_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty()
  orderDate!: string;

  @ApiProperty({ nullable: true })
  deliveryTerms!: string | null;

  @ApiProperty()
  paymentTermsDays!: number;

  @ApiProperty({ type: String, description: "Decimal string" })
  subtotal!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  taxAmount!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;

  @ApiProperty({ nullable: true })
  issuedAt!: Date | null;
}

export class PurchaseOrderLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  poId!: string;

  @ApiProperty()
  lineNo!: number;

  @ApiProperty({ format: "uuid", nullable: true })
  itemId!: string | null;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  unitPrice!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  receivedQty!: string;
}
