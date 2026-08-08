import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsUUID } from "class-validator";
import { FA_DEPRECIATION_RUN_STATUSES } from "../../domain/fa-depreciation-run.entity";

export class CreateFaDepreciationRunDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  periodId!: string;
}

export class DecideFaDepreciationRunDto {
  @ApiProperty({ enum: ["APPROVE", "RETURN"] })
  @IsIn(["APPROVE", "RETURN"])
  decision!: "APPROVE" | "RETURN";
}

export class FaDepreciationRunResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  periodId!: string;

  @ApiProperty({ enum: FA_DEPRECIATION_RUN_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}

export class FaDepreciationLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  runId!: string;

  @ApiProperty({ format: "uuid" })
  assetId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  nbvAfter!: string;
}
