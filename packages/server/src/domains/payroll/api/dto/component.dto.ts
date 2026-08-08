import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PYRL_COMPONENT_KINDS, PyrlComponentKind } from "../../domain/pyrl-component.entity";

export class CreatePyrlComponentDto {
  @ApiProperty({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  code!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: PYRL_COMPONENT_KINDS })
  @IsString()
  kind!: PyrlComponentKind;

  @ApiProperty()
  @IsBoolean()
  isTaxable!: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isStatutory?: boolean;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glAccountId!: string;
}

export class UpdatePyrlComponentDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isStatutory?: boolean;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  glAccountId?: string;
}

export class PyrlComponentResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: PYRL_COMPONENT_KINDS })
  kind!: PyrlComponentKind;

  @ApiProperty()
  isTaxable!: boolean;

  @ApiProperty()
  isStatutory!: boolean;

  @ApiProperty({ format: "uuid" })
  glAccountId!: string;
}
