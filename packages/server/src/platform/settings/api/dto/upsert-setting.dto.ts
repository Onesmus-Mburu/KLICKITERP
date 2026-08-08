import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

export class UpsertSettingDto {
  @ApiProperty({ description: "Arbitrary JSON value stored in set_setting.value", type: "object", additionalProperties: true })
  value!: unknown;

  @ApiPropertyOptional({ default: false, description: "If true, value is AES-256-GCM encrypted before storage (FR-SET-003.1)" })
  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;
}
