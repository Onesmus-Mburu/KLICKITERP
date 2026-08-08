import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { COMM_CHANNELS, CommChannel } from "../../domain/comm-template.entity";

export class CreateTemplateDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  eventCode!: string;

  @ApiProperty({ enum: COMM_CHANNELS })
  @IsIn(COMM_CHANNELS)
  channel!: CommChannel;

  @ApiPropertyOptional({ maxLength: 8, default: "en" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiProperty({ description: "Template body with {{variableName}} placeholders" })
  @IsString()
  body!: string;

  @ApiPropertyOptional({ type: Object, description: "Documents the placeholder names body/subject accept" })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
