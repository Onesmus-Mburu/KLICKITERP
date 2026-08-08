import { Type } from "class-transformer";
import { IsDefined, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { COMM_CHANNELS, CommChannel } from "../../domain/comm-template.entity";
import { AudienceDefDto } from "./audience-def.dto";

/** `Money.fromDecimalString`'s accepted shape — matches how other DTOs in this codebase validate decimal-string monetary fields. */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export class CreateBroadcastDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiProperty({ type: AudienceDefDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AudienceDefDto)
  audienceDef!: AudienceDefDto;

  @ApiProperty({ enum: COMM_CHANNELS })
  @IsIn(COMM_CHANNELS)
  channel!: CommChannel;

  @ApiProperty()
  @IsString()
  body!: string;

  @ApiPropertyOptional({ description: "Decimal string, e.g. \"150.0000\" — defaults to 0", default: "0" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  estCostAmount?: string;
}
