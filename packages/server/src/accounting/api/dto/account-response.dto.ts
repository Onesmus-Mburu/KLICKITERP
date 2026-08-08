import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GL_ACCOUNT_CLASSES, GL_ACCOUNT_CONTROL_DOMAINS } from "../../domain/gl-account.entity";

export class AccountResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 20 })
  code!: string;

  @ApiProperty({ maxLength: 120 })
  name!: string;

  @ApiProperty({ enum: GL_ACCOUNT_CLASSES })
  class!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  parentId!: string | null;

  @ApiProperty()
  isPostable!: boolean;

  @ApiProperty()
  isControl!: boolean;

  @ApiPropertyOptional({ enum: GL_ACCOUNT_CONTROL_DOMAINS, nullable: true })
  controlDomain!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional({ nullable: true })
  taxTreatment!: string | null;
}

export class AccountTreeNodeResponseDto extends AccountResponseDto {
  @ApiProperty({ type: () => [AccountTreeNodeResponseDto] })
  children!: AccountTreeNodeResponseDto[];
}
