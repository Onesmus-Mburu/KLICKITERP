import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString } from "class-validator";

export class UpdateDelegationDto {
  @ApiPropertyOptional({ type: String, format: "date" })
  @IsOptional()
  @IsDateString({ strict: true })
  startsOn?: string;

  @ApiPropertyOptional({ type: String, format: "date" })
  @IsOptional()
  @IsDateString({ strict: true })
  endsOn?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  reason?: string | null;
}
