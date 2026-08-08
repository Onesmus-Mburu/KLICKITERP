import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsUUID, Min } from "class-validator";
import { INTG_WEBHOOK_DELIVERY_STATUSES } from "../../domain/intg-webhook-delivery.entity";

export class ListWebhookDeliveriesQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @ApiPropertyOptional({ enum: INTG_WEBHOOK_DELIVERY_STATUSES })
  @IsOptional()
  @IsIn(INTG_WEBHOOK_DELIVERY_STATUSES)
  status?: (typeof INTG_WEBHOOK_DELIVERY_STATUSES)[number];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class WebhookDeliveryResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  subscriptionId!: string;

  @ApiProperty()
  eventType!: string;

  @ApiProperty({ type: Object })
  payload!: Record<string, unknown>;

  @ApiProperty()
  attempt!: number;

  @ApiProperty({ enum: INTG_WEBHOOK_DELIVERY_STATUSES })
  status!: string;

  @ApiProperty({ nullable: true })
  responseCode!: number | null;

  @ApiProperty({ format: "date-time" })
  nextRetryAt!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class ListWebhookDeliveriesResponseDto {
  @ApiProperty({ type: [WebhookDeliveryResponseDto] })
  items!: WebhookDeliveryResponseDto[];

  @ApiProperty({ type: Object })
  meta!: { total: number; page: number; pageSize: number; pageCount: number };
}

export class ProcessDueResponseDto {
  @ApiProperty()
  processed!: number;

  @ApiProperty()
  failed!: number;
}
