import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { INV_MOVEMENT_TYPES } from "../../domain/inv-movement.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class IssueStockDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  storeId!: string;

  @ApiProperty({ type: String, description: "Decimal string, positive" })
  @Matches(DECIMAL_PATTERN)
  qty!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Requesting department" })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: "Defaults to 'MANUAL_ISSUE' — the manual department-consumption path's own ref-doc type" })
  @IsOptional()
  @IsString()
  refDocType?: string;

  @ApiPropertyOptional({ format: "uuid", description: "Defaults to a freshly generated id — supply your own for replay-safety (see StockMovementsService's idempotency doc comment)" })
  @IsOptional()
  @IsUUID()
  refDocId?: string;
}

export class StockBalanceResponseDto {
  @ApiProperty({ format: "uuid" })
  itemId!: string;

  @ApiProperty({ format: "uuid" })
  storeId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  value!: string;
}

export class MovementResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  itemId!: string;

  @ApiProperty({ format: "uuid" })
  storeId!: string;

  @ApiProperty({ enum: INV_MOVEMENT_TYPES })
  movementType!: string;

  @ApiProperty({ type: String, description: "Signed decimal string" })
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string, scale 6" })
  unitCost!: string;

  @ApiProperty({ type: String, description: "Signed decimal string" })
  value!: string;

  @ApiProperty()
  refDocType!: string;

  @ApiProperty({ format: "uuid" })
  refDocId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  departmentId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;

  @ApiProperty()
  at!: Date;
}
