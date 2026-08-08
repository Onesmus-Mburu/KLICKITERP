import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class CreateWebhookSubscriptionDto {
  @ApiProperty({ maxLength: 300, description: "The subscriber's POST destination URL" })
  @IsString()
  @MaxLength(300)
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({ minLength: 8, description: "HMAC signing secret — encrypted at rest, never returned by any read endpoint" })
  @IsString()
  @MinLength(8)
  secret!: string;

  @ApiProperty({ type: [String], description: "Event-type filter, e.g. ['invoice.posted','payment.received']" })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  events!: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWebhookSubscriptionDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @IsUrl({ require_tld: false })
  url?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  events?: string[];
}

export class RotateWebhookSecretDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  secret!: string;
}

export class DisableWebhookSubscriptionDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  reason!: string;
}

/** Never carries `secretEnc`/the decrypted secret — see `WebhookSubscriptionsService`'s own class doc comment. */
export class WebhookSubscriptionResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ type: [String] })
  events!: string[];

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ nullable: true })
  disabledReason!: string | null;

  @ApiProperty({ format: "date-time", nullable: true })
  failureStreakStartedAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}
