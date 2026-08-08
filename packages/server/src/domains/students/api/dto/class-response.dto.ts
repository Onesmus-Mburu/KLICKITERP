import { ApiProperty } from "@nestjs/swagger";

export class ClassResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 40 })
  name!: string;

  @ApiProperty()
  level!: number;

  @ApiProperty()
  isActive!: boolean;
}
