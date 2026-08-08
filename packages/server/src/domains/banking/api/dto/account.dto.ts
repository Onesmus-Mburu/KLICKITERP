import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { BANK_ACCOUNT_KINDS } from "../../domain/bank-account.entity";

export class CreateBankAccountDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: BANK_ACCOUNT_KINDS })
  @IsIn(BANK_ACCOUNT_KINDS)
  kind!: "BANK" | "CASH" | "MPESA_SETTLEMENT" | "PETTY";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  accountNo?: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glAccountId!: string;
}

export class UpdateBankAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  bankName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  branch?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  accountNo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BankAccountResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: BANK_ACCOUNT_KINDS })
  kind!: string;

  @ApiProperty({ nullable: true })
  bankName!: string | null;

  @ApiProperty({ nullable: true })
  branch!: string | null;

  @ApiProperty({ nullable: true })
  accountNo!: string | null;

  @ApiProperty({ format: "uuid" })
  glAccountId!: string;

  @ApiProperty()
  isActive!: boolean;
}
