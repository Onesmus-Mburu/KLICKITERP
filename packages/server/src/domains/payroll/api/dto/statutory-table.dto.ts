import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsObject, IsOptional, IsString } from "class-validator";
import { PYRL_STATUTORY_KINDS, PyrlStatutoryKind } from "../../domain/pyrl-statutory-table.entity";

export class CreatePyrlStatutoryTableDto {
  @ApiProperty({ enum: PYRL_STATUTORY_KINDS })
  @IsString()
  kind!: PyrlStatutoryKind;

  @ApiProperty()
  @IsDateString()
  effectiveFrom!: string;

  @ApiProperty({ type: "object", additionalProperties: true, description: "Kind-specific params — see StatutoryCalculationService's documented per-kind jsonb contracts" })
  @IsObject()
  params!: Record<string, unknown>;

  @ApiProperty({ description: "Prominent provenance/disclaimer note — see 0900 seed's own disclaimer for the required tone" })
  @IsString()
  sourceNote!: string;
}

export class UpdatePyrlStatutoryTableDto {
  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceNote?: string;
}

export class PyrlStatutoryTableResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: PYRL_STATUTORY_KINDS })
  kind!: PyrlStatutoryKind;

  @ApiProperty()
  effectiveFrom!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  params!: Record<string, unknown>;

  @ApiProperty()
  sourceNote!: string;
}
