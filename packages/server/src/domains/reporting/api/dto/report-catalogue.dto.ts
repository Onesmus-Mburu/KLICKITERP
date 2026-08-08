import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional } from "class-validator";

export class ReportColumnResponseDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: ["string", "number", "money", "date"] })
  type!: string;
}

export class ReportDefinitionResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  domain!: string;

  @ApiProperty({ description: "The permission code that gates POST /reports/:code/execute for this report" })
  permissionCode!: string;

  @ApiProperty({ type: Object, description: "Map of param name -> \"string\"|\"number\"|\"date\"|\"uuid\"" })
  paramsShape!: Record<string, string>;

  @ApiProperty({ type: [ReportColumnResponseDto] })
  columns!: ReportColumnResponseDto[];
}

export class ExecuteReportDto {
  @ApiPropertyOptional({
    type: Object,
    description: "Report-specific parameters — validated at runtime against the report's own declared paramsShape",
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

export class ReportResultResponseDto {
  @ApiProperty({ type: [Object], description: "Row shape is report-specific — see the report's own columns[] contract" })
  rows!: Record<string, unknown>[];

  @ApiPropertyOptional({ type: Object, description: "Report-specific aggregate totals, if any" })
  totals?: Record<string, unknown>;

  @ApiProperty({ type: String, format: "date-time" })
  generatedAt!: string;
}
