import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class AssignDepartmentDto {
  @ApiPropertyOptional({ description: "null clears the assignment" })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;
}
