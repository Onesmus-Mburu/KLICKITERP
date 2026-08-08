import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

/** One student's promotion target — nested inside `PromoteBatchDto.promotions[]`. */
export class PromotionInputDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  toClassId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  toStreamId?: string;
}
