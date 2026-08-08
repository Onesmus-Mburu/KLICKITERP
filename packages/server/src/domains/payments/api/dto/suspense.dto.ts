import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { PAY_SUSPENSE_ITEM_SOURCES, PAY_SUSPENSE_ITEM_STATES } from "../../domain/pay-suspense-item.entity";

export class MatchSuspenseItemDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;
}

export class ReverseSuspenseRefundDto {
  @ApiProperty({ format: "uuid", description: "A PAYMENT_REVERSALS appr_instance id already in APPROVED status (see POST .../refund/request)" })
  @IsUUID()
  approvalRef!: string;
}

export class SuspenseItemResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: PAY_SUSPENSE_ITEM_SOURCES })
  source!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty()
  externalRef!: string;

  @ApiProperty()
  receivedAt!: Date;

  @ApiProperty({ enum: PAY_SUSPENSE_ITEM_STATES })
  state!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  resolvedReceiptId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  resolvedBy!: string | null;

  @ApiProperty({ nullable: true })
  resolvedAt!: Date | null;

  @ApiProperty({ nullable: true })
  resolutionNote!: string | null;
}

export class SuspenseRefundApprovalResponseDto {
  @ApiProperty({ format: "uuid", description: "appr_instance id — pass back as approvalRef to POST .../refund once APPROVED" })
  instanceId!: string;

  @ApiProperty({ enum: ["PENDING", "APPROVED", "REJECTED", "RETURNED", "CANCELLED"] })
  status!: string;
}
