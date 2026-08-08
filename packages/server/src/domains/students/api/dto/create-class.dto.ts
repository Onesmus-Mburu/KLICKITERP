import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsString, MaxLength, Min } from "class-validator";

export class CreateClassDto {
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MaxLength(40)
  name!: string;

  @ApiProperty({ description: "Ordering rung on the class ladder (e.g. 1 for Grade 1)" })
  @IsInt()
  @Min(0)
  level!: number;
}
