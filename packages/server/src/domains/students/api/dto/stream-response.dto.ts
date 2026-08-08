import { ApiProperty } from "@nestjs/swagger";

export class StreamResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  classId!: string;

  @ApiProperty({ maxLength: 40 })
  name!: string;
}
