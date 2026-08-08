import { ApiProperty } from "@nestjs/swagger";
import { IsUUID, Matches } from "class-validator";
import { BANK_TRANSFER_STATUSES } from "../../domain/bank-transfer.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateBankTransferDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  fromAccountId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  toAccountId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;
}

export class BankTransferResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  fromAccountId!: string;

  @ApiProperty({ format: "uuid" })
  toAccountId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ enum: BANK_TRANSFER_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}
