import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsUUID, ValidateNested } from "class-validator";
import { PromotionInputDto } from "./promotion-input.dto";

export class PromoteBatchDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  fromYearId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  toYearId!: string;

  @ApiProperty({ type: [PromotionInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PromotionInputDto)
  promotions!: PromotionInputDto[];
}
