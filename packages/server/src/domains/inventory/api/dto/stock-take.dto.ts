import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsIn, IsString, IsUUID, Matches, ValidateNested } from "class-validator";
import { INV_STOCK_TAKE_STATUSES } from "../../domain/inv-stock-take.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class StockTakeScopeDto {
  @ApiProperty({
    description: "'ALL' (every item with a tracked balance at this store) or an explicit array of item ids — see stock-take-scope.util.ts",
    oneOf: [{ type: "string", enum: ["ALL"] }, { type: "array", items: { type: "string", format: "uuid" } }],
  })
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
