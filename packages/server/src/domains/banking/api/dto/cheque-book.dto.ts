import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsString, IsUUID, Min } from "class-validator";

export class CreateChequeBookDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  accountId!: string;

  @ApiProperty()
  @IsString()
  prefix!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  startLeaf!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  endLeaf!: number;
}

export class BankChequeBookResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  accountId!: string;

  @ApiProperty()
  prefix!: string;

  @ApiProperty()
  startLeaf!: number;

  @ApiProperty()
  endLeaf!: number;
}
