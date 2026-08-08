import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { SetIntegrationKind } from "../../domain/set-integration-config.entity";

const INTEGRATION_KINDS: SetIntegrationKind[] = [
  "SMTP",
  "SMS",
  "FCM",
  "MPESA",
  "QUICKBOOKS",
  "XERO",
  "SAGE",
  "BANK",
  "WHATSAPP",
];

export class CreateIntegrationConfigDto {
  @ApiProperty({ enum: INTEGRATION_KINDS })
  @IsIn(INTEGRATION_KINDS)
  kind!: SetIntegrationKind;

  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ type: "object", additionalProperties: true, description: "Plaintext credential payload — encrypted (AES-256-GCM) before storage, never persisted or logged raw" })
  @IsObject()
  config!: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
