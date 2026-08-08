import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, Matches } from "class-validator";

export class SetAuthorityLimitDto {
  @ApiPropertyOptional({
    description: "Decimal string, KES, e.g. '50000.0000'; omit/null clears the limit",
    example: "50000.0000",
  })
  @IsOptional()
  @Matches(/^-?\d+(\.\d+)?$/, { message: "amount must be a decimal string" })
  amount?: string | null;
}
