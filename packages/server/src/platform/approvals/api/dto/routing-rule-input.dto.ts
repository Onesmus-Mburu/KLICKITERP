import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsUUID, Matches, Min } from "class-validator";

/** `Money.fromDecimalString`'s accepted shape — matches this codebase's convention for decimal-string monetary DTO fields. */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Nested shape for one `appr_routing_rule` row — used both standalone (`CreateRoutingRuleDto`) and inside `PublishWorkflowVersionDto.routingRules[]`. */
export class RoutingRuleInputDto {
  @ApiProperty({ type: String, description: "Decimal string, inclusive lower bound" })
  @Matches(DECIMAL_PATTERN)
  minAmount!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: "Decimal string, exclusive upper bound; omit for no upper bound" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  maxAmount?: string;

  @ApiPropertyOptional({
    type: [Number],
    nullable: true,
    description: "appr_level.seq values this rule selects; omit/null for all levels of the version",
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  levelSubset?: number[];

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
