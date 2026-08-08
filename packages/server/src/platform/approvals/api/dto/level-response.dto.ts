import { ApiProperty } from "@nestjs/swagger";
import { APPR_LEVEL_APPROVER_TYPES, APPR_LEVEL_MODES, ApprLevelApproverType, ApprLevelMode } from "../../domain/appr-level.entity";

export class LevelResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  workflowVersionId!: string;

  @ApiProperty()
  seq!: number;

  @ApiProperty({ enum: APPR_LEVEL_APPROVER_TYPES })
  approverType!: ApprLevelApproverType;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  roleId!: string | null;

  @ApiProperty({ nullable: true, type: [String] })
  userIds!: string[] | null;

  @ApiProperty({ enum: APPR_LEVEL_MODES })
  mode!: ApprLevelMode;

  @ApiProperty()
  quorum!: number;

  @ApiProperty({ nullable: true, type: Number })
  slaHours!: number | null;

  @ApiProperty({ nullable: true, type: Object })
  escalation!: Record<string, unknown> | null;
}
