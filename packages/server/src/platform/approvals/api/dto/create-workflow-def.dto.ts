import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateWorkflowDefDto {
  @ApiProperty({ maxLength: 30, description: "Open string namespace, e.g. BILLING_WAIVER, PAYMENT_VOUCHER" })
  @IsString()
  @MaxLength(30)
  domainCode!: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
