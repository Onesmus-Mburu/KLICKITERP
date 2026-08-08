import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class FeeGroupResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 60 })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;
}
