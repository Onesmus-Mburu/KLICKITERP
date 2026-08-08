import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { PYRL_RUN_KINDS, PYRL_RUN_STATUSES, PyrlRunKind, PyrlRunStatus } from "../../domain/pyrl-run.entity";
import { PYRL_RUN_LINE_PAID_VIA_VALUES, PyrlRunLinePaidVia } from "../../domain/pyrl-run-line.entity";

export class CreatePyrlRunDto {
  @ApiProperty({ description: "'YYYY-MM'" })
  @IsString()
  periodKey!: string;

  @ApiProperty({ enum: PYRL_RUN_KINDS })
  @IsIn(PYRL_RUN_KINDS)
  runKind!: PyrlRunKind;

  @ApiPropertyOptional({ format: "uuid", description: "Required when runKind=SUPPLEMENTARY — the MAIN run this corrects" })
  @IsOptional()
  @IsUUID()
  supplementsRunId?: string;
}

export class DecidePyrlRunDto {
  @ApiProperty()
  approved!: boolean;
}

export class PayPyrlRunDto {
  @ApiProperty({ enum: PYRL_RUN_LINE_PAID_VIA_VALUES })
  @IsIn(PYRL_RUN_LINE_PAID_VIA_VALUES)
  method!: PyrlRunLinePaidVia;
}

export class PyrlRunTotalsResponseDto {
  @ApiProperty()
  employeeCount!: number;

  @ApiProperty({ type: String })
  totalGross!: string;

  @ApiProperty({ type: String })
  totalTaxable!: string;

  @ApiProperty({ type: String })
  totalPaye!: string;

  @ApiProperty({ type: String })
  totalNssfEmployee!: string;

  @ApiProperty({ type: String })
  totalNssfEmployer!: string;

  @ApiProperty({ type: String })
  totalShif!: string;

  @ApiProperty({ type: String })
  totalAhlEmployee!: string;

  @ApiProperty({ type: String })
  totalAhlEmployer!: string;

  @ApiProperty({ type: String })
  totalLoanRecovered!: string;

  @ApiProperty({ type: String })
  totalOtherDeductions!: string;

  @ApiProperty({ type: String })
  totalNetPay!: string;
}

export class PyrlRunResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  periodKey!: string;

  @ApiProperty({ enum: PYRL_RUN_KINDS })
  runKind!: PyrlRunKind;

  @ApiProperty({ format: "uuid", nullable: true })
  supplementsRunId!: string | null;

  @ApiProperty({ enum: PYRL_RUN_STATUSES })
  status!: PyrlRunStatus;

  @ApiProperty({ format: "uuid" })
  initiatedBy!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvedBy!: string | null;

  @ApiProperty({ nullable: true })
  committedAt!: Date | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  totals!: Record<string, unknown>;

  @ApiProperty({ type: "object", additionalProperties: true, nullable: true })
  varianceReport!: Record<string, unknown> | null;
}

export class PyrlRunLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  runId!: string;

  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ type: String })
  gross!: string;

  @ApiProperty({ type: String })
  taxable!: string;

  @ApiProperty({ type: String })
  paye!: string;

  @ApiProperty({ type: String })
  nssfEmployee!: string;

  @ApiProperty({ type: String })
  nssfEmployer!: string;

  @ApiProperty({ type: String })
  shif!: string;

  @ApiProperty({ type: String })
  ahlEmployee!: string;

  @ApiProperty({ type: String })
  ahlEmployer!: string;

  @ApiProperty({ type: String })
  loanRecovered!: string;

  @ApiProperty({ type: String })
  otherDeductions!: string;

  @ApiProperty({ type: String })
  netPay!: string;

  @ApiProperty({ type: String })
  deferredRecovery!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  payslipFileId!: string | null;

  @ApiProperty({ nullable: true })
  paidVia!: PyrlRunLinePaidVia | null;

  @ApiProperty({ nullable: true })
  paidAt!: Date | null;
}

export class PyrlRunLineComponentResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  runLineId!: string;

  @ApiProperty({ format: "uuid" })
  componentId!: string;

  @ApiProperty({ type: String })
  amount!: string;
}
