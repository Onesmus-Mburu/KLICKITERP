import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsISO8601, IsUUID } from "class-validator";

export class RunLateFeeBatchDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  policyId!: string;

  @ApiProperty({ type: String, format: "date" })
  @IsISO8601({ strict: true })
  runDate!: string;
}

export class DecideLateFeeBatchDto {
  @ApiProperty()
  @IsBoolean()
  approved!: boolean;
}

export class LateFeeBatchResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  policyId!: string;

  @ApiProperty({ type: String, format: "date" })
  runDate!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true, description: "LateFeeBatchSummary — totalAssessed/studentCount/entries" })
  summary!: Record<string, unknown>;
}
