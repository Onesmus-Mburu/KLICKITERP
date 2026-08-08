import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, MaxLength } from "class-validator";

export class ListFilesQueryDto {
  @ApiProperty({ maxLength: 60, description: "Polymorphic owner type, e.g. STUDENT" })
  @IsString()
  @MaxLength(60)
  entityType!: string;

  @ApiProperty({ format: "uuid", description: "Polymorphic owner id" })
  @IsUUID()
  entityId!: string;
}
