import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsString, MaxLength } from "class-validator";

export class CreateAcademicYearDto {
  @ApiProperty({ maxLength: 20, example: "2026" })
  @IsString()
  @MaxLength(20)
  name!: string;

  @ApiProperty({ example: "2026-01-01" })
  @IsDateString()
  startsOn!: string;

  @ApiProperty({ example: "2026-12-31" })
  @IsDateString()
  endsOn!: string;
}
