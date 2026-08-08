import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, MaxLength } from "class-validator";

export class CreateStreamDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  classId!: string;

  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MaxLength(40)
  name!: string;
}
