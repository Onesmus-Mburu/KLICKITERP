import { ApiProperty } from "@nestjs/swagger";

const INSTANCE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "RETURNED", "CANCELLED"] as const;

export class InstanceResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  workflowVersionId!: string;

  @ApiProperty({ maxLength: 30 })
  domainCode!: string;

  @ApiProperty({ maxLength: 60 })
  entityType!: string;

  @ApiProperty({ format: "uuid" })
  entityId!: string;

  @ApiProperty({ nullable: true, type: String, description: "Decimal string" })
  amount!: string | null;

  @ApiProperty({ format: "uuid" })
  initiatorId!: string;

  @ApiProperty({ enum: INSTANCE_STATUSES })
  status!: (typeof INSTANCE_STATUSES)[number];

  @ApiProperty()
  currentLevel!: number;

  @ApiProperty()
  submittedAt!: Date;

  @ApiProperty({ nullable: true, type: Date })
  decidedAt!: Date | null;
}
