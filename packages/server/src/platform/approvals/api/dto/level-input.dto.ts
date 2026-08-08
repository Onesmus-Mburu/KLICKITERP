import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
} from "class-validator";
import { APPR_LEVEL_APPROVER_TYPES, APPR_LEVEL_MODES } from "../../domain/appr-level.entity";

/** Nested shape for one `appr_level` row — used both standalone (`CreateLevelDto`) and inside `PublishWorkflowVersionDto.levels[]`. */
export class LevelInputDto {
  @ApiProperty({ description: "Position within the workflow version, ascending; unique per version" })
  @IsInt()
  @Min(1)
  seq!: number;

  @ApiProperty({ enum: APPR_LEVEL_APPROVER_TYPES })
  @IsIn(APPR_LEVEL_APPROVER_TYPES)
  approverType!: (typeof APPR_LEVEL_APPROVER_TYPES)[number];

  @ApiPropertyOptional({ format: "uuid", description: "Required when approverType=ROLE" })
  @ValidateIf((o: LevelInputDto) => o.approverType === "ROLE")
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ type: [String], description: "Required when approverType=USERS" })
  @ValidateIf((o: LevelInputDto) => o.approverType === "USERS")
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  userIds?: string[];

  @ApiProperty({ enum: APPR_LEVEL_MODES })
  @IsIn(APPR_LEVEL_MODES)
  mode!: (typeof APPR_LEVEL_MODES)[number];

  @ApiPropertyOptional({ default: 1, description: "PARALLEL-mode quorum (n-of-m); ignored for SEQUENTIAL" })
  @IsOptional()
  @IsInt()
  @Min(1)
  quorum?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  slaHours?: number;

  @ApiPropertyOptional({ type: Object, nullable: true, description: "Escalation config — stored, not yet acted on (no scheduler exists)" })
  @IsOptional()
  @IsObject()
  escalation?: Record<string, unknown>;
}
