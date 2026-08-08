import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, ValidateNested } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { LevelInputDto } from "./level-input.dto";
import { RoutingRuleInputDto } from "./routing-rule-input.dto";

/**
 * `WorkflowVersionsService.publishNewVersion()`'s request shape — creates a
 * new version + its levels + its routing rules atomically and marks it
 * current. `routingRules` may be empty (submit() then falls back to ALL
 * levels for every amount).
 */
export class PublishWorkflowVersionDto {
  @ApiProperty({ type: [LevelInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LevelInputDto)
  levels!: LevelInputDto[];

  @ApiProperty({ type: [RoutingRuleInputDto], required: false, default: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingRuleInputDto)
  routingRules: RoutingRuleInputDto[] = [];
}
