import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateTermDto {
  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  name?: string;

  @ApiPropertyOptional({ minimum: 1, description: "Billing-affecting — rejected while the term is billing-locked" })
  @IsOptional()
  @IsInt()
  @Min(1)
  seq?: number;

  @ApiPropertyOptional({ description: "Billing-affecting — rejected while the term is billing-locked" })
  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @ApiPropertyOptional({ description: "Billing-affecting — rejected while the term is billing-locked" })
  @IsOptional()
  @IsDateString()
  endsOn?: string;
}
