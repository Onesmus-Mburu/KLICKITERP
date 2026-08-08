import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class AssignPermissionDto {
  @ApiProperty({ example: "billing:invoice:void", description: "Must exist in the permission catalogue" })
  @IsString()
  @MaxLength(80)
  permissionCode!: string;
}
