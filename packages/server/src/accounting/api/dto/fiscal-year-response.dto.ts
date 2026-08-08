import { ApiProperty } from "@nestjs/swagger";
import { GL_FISCAL_YEAR_STATUSES } from "../../domain/gl-fiscal-year.entity";

export class FiscalYearResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 20 })
  name!: string;

  @ApiProperty({ type: String, format: "date" })
  startsOn!: string;

  @ApiProperty({ type: String, format: "date" })
  endsOn!: string;

  @ApiProperty({ enum: GL_FISCAL_YEAR_STATUSES })
  status!: string;
}
