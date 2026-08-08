import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsUUID, Matches } from "class-validator";
import { FA_DISPOSAL_METHODS, FA_DISPOSAL_STATUSES, FaDisposalMethod } from "../../domain/fa-disposal.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateFaDisposalDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  assetId!: string;

  @ApiProperty({ enum: FA_DISPOSAL_METHODS })
  @IsIn(FA_DISPOSAL_METHODS)
  method!: FaDisposalMethod;

  @ApiPropertyOptional({ type: String, description: "Decimal string. Defaults to 0 (DONATION/WRITE_OFF)" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  proceeds?: string;
}

export class DecideFaDisposalDto {
  @ApiProperty({ enum: ["APPROVE", "RETURN"] })
  @IsIn(["APPROVE", "RETURN"])
  decision!: "APPROVE" | "RETURN";
}

export class FaDisposalResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  assetId!: string;

  @ApiProperty({ enum: FA_DISPOSAL_METHODS })
  method!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  proceeds!: string;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string — proceeds minus NBV at disposal" })
  gainLoss!: string | null;

  @ApiProperty({ enum: FA_DISPOSAL_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}
