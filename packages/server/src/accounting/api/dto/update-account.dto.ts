import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { GL_ACCOUNT_CONTROL_DOMAINS, GlAccountControlDomain } from "../../domain/gl-account.entity";

/** `code`/`class`/`parentId`/`isPostable` are locked post-creation — see `ChartOfAccountsService`'s doc comment. */
export class UpdateAccountDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isControl?: boolean;

  @ApiPropertyOptional({ enum: GL_ACCOUNT_CONTROL_DOMAINS, nullable: true })
  @IsOptional()
  @IsIn(GL_ACCOUNT_CONTROL_DOMAINS)
  controlDomain?: GlAccountControlDomain | null;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxTreatment?: string | null;
}
