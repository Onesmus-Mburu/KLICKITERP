import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsString, IsUUID, Matches, Min } from "class-validator";
import { PYRL_LOAN_RATE_KINDS, PYRL_LOAN_STATUSES, PyrlLoanRateKind, PyrlLoanStatus } from "../../domain/pyrl-loan.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreatePyrlLoanDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  principal!: string;

  @ApiProperty({ type: String, description: "Annual rate as a decimal fraction, e.g. \"0.145\" for 14.5%/year" })
  @Matches(DECIMAL_PATTERN)
  rate!: string;

  @ApiProperty({ enum: PYRL_LOAN_RATE_KINDS })
  @IsIn(PYRL_LOAN_RATE_KINDS)
  rateKind!: PyrlLoanRateKind;

  @ApiProperty()
  @IsInt()
  @Min(1)
  termMonths!: number;
}

export class DecidePyrlLoanDto {
  @ApiProperty()
  @IsBoolean()
  approved!: boolean;
}

export class RecordLoanRecoveryDto {
  @ApiProperty({ description: "'YYYY-MM'" })
  @IsString()
  periodKey!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;
}

export class SettleLoanEarlyDto {
  @ApiProperty({ description: "'YYYY-MM-DD' settlement date" })
  @IsString()
  settlementDate!: string;
}

export class PyrlLoanResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  principal!: string;

  @ApiProperty({ type: String })
  rate!: string;

  @ApiProperty({ enum: PYRL_LOAN_RATE_KINDS })
  rateKind!: PyrlLoanRateKind;

  @ApiProperty()
  termMonths!: number;

  @ApiProperty({ enum: PYRL_LOAN_STATUSES })
  status!: PyrlLoanStatus;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  balance!: string;
}

export class PyrlLoanScheduleResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  loanId!: string;

  @ApiProperty()
  seq!: number;

  @ApiProperty()
  duePeriod!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  principalDue!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  interestDue!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  recoveredAmount!: string;
}
