import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateSavedParamsDto {
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MaxLength(40)
  reportCode!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  params!: Record<string, unknown>;
}

export class UpdateSavedParamsDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

export class SavedParamsResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty()
  reportCode!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: Object })
  params!: Record<string, unknown>;
}
