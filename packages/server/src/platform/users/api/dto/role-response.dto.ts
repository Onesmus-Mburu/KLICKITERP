import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RoleResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 60 })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  isSystemTemplate!: boolean;

  @ApiProperty({ description: "BR-SEC-04 — an auditor-class role may never hold an is_write permission" })
  isAuditorClass!: boolean;
}

export class AssignRoleResultDto {
  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty({ format: "uuid" })
  roleId!: string;

  @ApiProperty()
  assigned!: boolean;
}
