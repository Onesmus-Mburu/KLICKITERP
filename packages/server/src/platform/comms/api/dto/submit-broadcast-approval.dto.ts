import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

/** The real approval workflow engine is Module 6 (Approvals), not built yet — this only stores/requires the caller-supplied reference. */
export class SubmitBroadcastApprovalDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  approvalRef!: string;
}
