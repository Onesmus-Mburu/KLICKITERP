import { ApiProperty } from "@nestjs/swagger";

export class CostCenterResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 20 })
  code!: string;

  @ApiProperty({ maxLength: 80 })
  name!: string;

  @ApiProperty()
  isActive!: boolean;
}
