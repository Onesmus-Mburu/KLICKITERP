import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsInt, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class CreateTermDto {
  @ApiProperty()
  @IsUUID()
  academicYearId!: string;

  @ApiProperty({ maxLength: 20, example: "Term 1" })
  @IsString()
  @MaxLength(20)
  name!: string;

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  seq!: number;

  @ApiProperty({ example: "2026-01-01" })
  @IsDateString()
  startsOn!: string;

  @ApiProperty({ example: "2026-04-30" })
  @IsDateString()
  endsOn!: string;
}
