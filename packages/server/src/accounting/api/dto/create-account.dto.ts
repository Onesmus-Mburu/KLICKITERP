import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { GL_ACCOUNT_CLASSES, GL_ACCOUNT_CONTROL_DOMAINS, GlAccountClass, GlAccountControlDomain } from "../../domain/gl-account.entity";

export class CreateAccountDto {
  @ApiProperty({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  code!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: GL_ACCOUNT_CLASSES })
  @IsIn(GL_ACCOUNT_CLASSES)
  class!: GlAccountClass;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Required when isPostable=true (roots are headers)" })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty()
  @IsBoolean()
  isPostable!: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isControl?: boolean;

  @ApiPropertyOptional({ enum: GL_ACCOUNT_CONTROL_DOMAINS, nullable: true })
  @IsOptional()
  @IsIn(GL_ACCOUNT_CONTROL_DOMAINS)
  controlDomain?: GlAccountControlDomain;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxTreatment?: string;
}
