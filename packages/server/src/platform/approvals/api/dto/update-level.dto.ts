import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
} from "class-validator";
import { APPR_LEVEL_APPROVER_TYPES, APPR_LEVEL_MODES } from "../../domain/appr-level.entity";

export class UpdateLevelDto {
  @ApiPropertyOptional({ enum: APPR_LEVEL_APPROVER_TYPES })
  @IsOptional()
  @IsIn(APPR_LEVEL_APPROVER_TYPES)
  approverType?: (typeof APPR_LEVEL_APPROVER_TYPES)[number];

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  roleId?: string | null;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  userIds?: string[] | null;

  @ApiPropertyOptional({ enum: APPR_LEVEL_MODES })
  @IsOptional()
  @IsIn(APPR_LEVEL_MODES)
  mode?: (typeof APPR_LEVEL_MODES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  quorum?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  slaHours?: number | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  escalation?: Record<string, unknown> | null;
}
