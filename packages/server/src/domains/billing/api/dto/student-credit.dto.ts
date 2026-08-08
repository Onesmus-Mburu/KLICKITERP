import { ApiProperty } from "@nestjs/swagger";

/** Phase 6 Slice 12 (Part D) — `GET /billing/students/:studentId/credit-balance` response shape, Part E's future student-detail "Credit Balance" card. */
export class StudentCreditBalanceResponseDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ type: String, description: "Decimal string — 0.0000 for a student with no credit balance activity at all (no bill_student_credit row is created just to serve this read)" })
  balance!: string;
}
