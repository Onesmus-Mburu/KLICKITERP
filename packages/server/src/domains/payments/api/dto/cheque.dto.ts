import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";
import { PAY_CHEQUE_STATUSES } from "../../domain/pay-cheque.entity";

export class BounceChequeDto {
  @ApiPropertyOptional({ default: false, description: "FR-PAY-007.1's optional bounce fee (P-05, via InvoicingService)" })
  @IsOptional()
  @IsBoolean()
  applyBounceFee?: boolean;
}

export class ChequeResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  bankName!: string;

  @ApiProperty()
  chequeNo!: string;

  @ApiProperty()
  chequeDate!: string;

  @ApiProperty()
  drawer!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ enum: PAY_CHEQUE_STATUSES })
  status!: string;

  @ApiProperty({ nullable: true })
  statusChangedAt!: Date | null;

  @ApiProperty()
  bounceFeeApplied!: boolean;
}
