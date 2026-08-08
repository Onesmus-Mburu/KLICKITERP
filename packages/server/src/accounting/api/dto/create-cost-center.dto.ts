import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class CreateCostCenterDto {
  @ApiProperty({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  code!: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  name!: string;
}
