import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { COMM_CHANNELS, CommChannel } from "../../domain/comm-template.entity";

export class CreateTriggerBindingDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  eventCode!: string;

  @ApiProperty({ enum: COMM_CHANNELS })
  @IsIn(COMM_CHANNELS)
  channel!: CommChannel;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  audienceRule?: Record<string, unknown>;
}
