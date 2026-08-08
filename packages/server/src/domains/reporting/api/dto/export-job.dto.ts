import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsObject, IsString, MaxLength } from "class-validator";

export class CreateExportJobDto {
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MaxLength(40)
  reportCode!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  params!: Record<string, unknown>;

  @ApiProperty({ enum: ["CSV", "XLSX", "PDF"] })
  @IsIn(["CSV", "XLSX", "PDF"])
  format!: "CSV" | "XLSX" | "PDF";
}

export class ExportJobResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  reportCode!: string;

  @ApiProperty({ type: Object })
  params!: Record<string, unknown>;

  @ApiProperty({ format: "uuid" })
  requestedBy!: string;

  @ApiProperty({ enum: ["QUEUED", "RUNNING", "DONE", "FAILED"] })
  status!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  fileId!: string | null;
}
