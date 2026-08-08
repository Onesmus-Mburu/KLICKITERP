import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsUUID } from "class-validator";

export class BulkGenerateDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  termId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  classIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  streamIds?: string[];
}

export class BulkGenerateFailureDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty()
  error!: string;
}

export class BulkGenerateResultDto {
  @ApiProperty({ type: [String] })
  succeeded!: string[];

  @ApiProperty({ type: [BulkGenerateFailureDto] })
  failed!: BulkGenerateFailureDto[];
}
