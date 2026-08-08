import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";
import { BudgetLineInputDto } from "./budget-line-input.dto";

export class CreateBudgetDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  fiscalYearId!: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  versionLabel!: string;

  @ApiProperty({ type: [BudgetLineInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BudgetLineInputDto)
  lines!: BudgetLineInputDto[];
}
