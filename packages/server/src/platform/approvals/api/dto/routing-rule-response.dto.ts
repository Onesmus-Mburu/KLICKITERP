import { ApiProperty } from "@nestjs/swagger";

export class RoutingRuleResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  workflowVersionId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  minAmount!: string;

  @ApiProperty({ nullable: true, type: String, description: "Decimal string" })
  maxAmount!: string | null;

  @ApiProperty({ nullable: true, type: [Number] })
  levelSubset!: number[] | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  departmentId!: string | null;
}
