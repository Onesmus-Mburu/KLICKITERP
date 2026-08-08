import { ApiProperty } from "@nestjs/swagger";

export class PromotionBatchResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  fromYearId!: string;

  @ApiProperty({ format: "uuid" })
  toYearId!: string;

  @ApiProperty({ type: String, format: "date-time" })
  executedAt!: Date;

  @ApiProperty({ type: "object", additionalProperties: true })
  summary!: Record<string, unknown>;
}
