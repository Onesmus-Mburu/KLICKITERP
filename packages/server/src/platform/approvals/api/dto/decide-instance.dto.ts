import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

const DECISIONS = ["APPROVE", "REJECT", "RETURN"] as const;

export class DecideInstanceDto {
  @ApiProperty({ enum: DECISIONS })
  @IsIn(DECISIONS)
  decision!: (typeof DECISIONS)[number];

  @ApiPropertyOptional({ description: "Required for REJECT/RETURN (FR-APPR-003.1)" })
  @IsOptional()
  @IsString()
  comment?: string;
}
