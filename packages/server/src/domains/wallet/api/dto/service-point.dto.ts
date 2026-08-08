import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { WALL_SERVICE_POINT_TYPES } from "../../domain/wall-service-point.entity";

const DECIMAL_STRING_PATTERN = /^\d+(\.\d{1,4})?$/;

export class CreateServicePointDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: WALL_SERVICE_POINT_TYPES })
  @IsIn(WALL_SERVICE_POINT_TYPES)
  type!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glIncomeAccountId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Matches(DECIMAL_STRING_PATTERN)
  perTxnLimit?: string;
}

export class UpdateServicePointDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Matches(DECIMAL_STRING_PATTERN)
  perTxnLimit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignOperatorDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  userId!: string;
}

export class ServicePointResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: WALL_SERVICE_POINT_TYPES })
  type!: string;

  @ApiProperty({ format: "uuid" })
  glIncomeAccountId!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, nullable: true })
  perTxnLimit!: string | null;
}

export class ServicePointOperatorResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  servicePointId!: string;

  @ApiProperty({ format: "uuid" })
  userId!: string;
}
