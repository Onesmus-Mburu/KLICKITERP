import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { SetCustomFieldEntityType, SetCustomFieldType } from "../../domain/set-custom-field-def.entity";

const CUSTOM_FIELD_ENTITIES: SetCustomFieldEntityType[] = ["STUDENT", "SUPPLIER", "EMPLOYEE", "ASSET"];
const CUSTOM_FIELD_TYPES: SetCustomFieldType[] = ["TEXT", "NUMBER", "DATE", "SELECT"];

export class CreateCustomFieldDto {
  @ApiProperty({ enum: CUSTOM_FIELD_ENTITIES })
  @IsIn(CUSTOM_FIELD_ENTITIES)
  entity!: SetCustomFieldEntityType;

  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MaxLength(40)
  key!: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  label!: string;

  @ApiProperty({ enum: CUSTOM_FIELD_TYPES })
  @IsIn(CUSTOM_FIELD_TYPES)
  fieldType!: SetCustomFieldType;

  @ApiPropertyOptional({ description: "e.g. SELECT option list — shape is field-type specific, unvalidated JSON" })
  @IsOptional()
  options?: unknown;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}
