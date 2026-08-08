import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateFiscalYearDto {
  @ApiProperty({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  name!: string;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  startsOn!: string;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  endsOn!: string;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 366 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(366)
  periodCount?: number;
}
