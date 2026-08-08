import { ApiProperty } from "@nestjs/swagger";
import { GL_PERIOD_STATUSES } from "../../domain/gl-period.entity";

export class PeriodResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  fiscalYearId!: string;

  @ApiProperty()
  seq!: number;

  @ApiProperty({ type: String, format: "date" })
  startsOn!: string;

  @ApiProperty({ type: String, format: "date" })
  endsOn!: string;

  @ApiProperty({ enum: GL_PERIOD_STATUSES })
  status!: string;
}
