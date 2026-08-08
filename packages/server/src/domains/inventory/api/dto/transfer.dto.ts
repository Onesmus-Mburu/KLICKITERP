import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsUUID, Matches, ValidateNested } from "class-validator";
import { INV_TRANSFER_STATUSES } from "../../domain/inv-transfer.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class IssueTransferLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ type: String, description: "Decimal string, positive" })
  @Matches(DECIMAL_PATTERN)
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string, scale <=6" })
  @Matches(DECIMAL_PATTERN)
  unitCost!: string;
}

export class IssueTransferDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  fromStoreId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  toStoreId!: string;

  @ApiProperty({ type: [IssueTransferLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => IssueTransferLineDto)
  lines!: IssueTransferLineDto[];
}

export class TransferResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  fromStoreId!: string;

  @ApiProperty({ format: "uuid" })
  toStoreId!: string;

  @ApiProperty({ enum: INV_TRANSFER_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid" })
  issuedBy!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  receivedBy!: string | null;
}

export class TransferLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  transferId!: string;

  @ApiProperty()
  lineNo!: number;

  @ApiProperty({ format: "uuid" })
  itemId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string, scale 6" })
  unitCost!: string;
}
