import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class DepartmentResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 80 })
  name!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  headUserId!: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Joined from the headUser relation; null if unset" })
  headUserFullName!: string | null;
}
