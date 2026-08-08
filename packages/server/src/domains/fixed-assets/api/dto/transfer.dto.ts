import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID } from "class-validator";

export class CreateFaTransferDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  assetId!: string;

  @ApiProperty()
  @IsString()
  toLocation!: string;

  @ApiProperty({ format: "uuid", nullable: true, required: false })
  @IsOptional()
  @IsUUID()
  toCustodianUserId?: string;
}

export class FaTransferResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  assetId!: string;

  @ApiProperty()
  fromLocation!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  fromCustodianUserId!: string | null;

  @ApiProperty()
  toLocation!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  toCustodianUserId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  ackBy!: string | null;

  @ApiProperty()
  at!: Date;
}
