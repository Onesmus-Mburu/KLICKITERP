import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PermissionResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 80, example: "billing:invoice:void" })
  code!: string;

  @ApiProperty({ maxLength: 30 })
  module!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  isWrite!: boolean;
}

export class GrantPermissionResultDto {
  @ApiProperty({ format: "uuid" })
  roleId!: string;

  @ApiProperty({ example: "billing:invoice:void" })
  permissionCode!: string;

  @ApiProperty()
  granted!: boolean;
}
