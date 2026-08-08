import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { StudentCreditService } from "../application/student-credit.service";
import { StudentCreditBalanceResponseDto } from "./dto/student-credit.dto";

/**
 * `bill_student_credit` — Phase 6 Slice 12 (Part D — Credit Balance
 * Forward). Read-only surface only: the two mutations that ever touch this
 * table (issuing credit on an overpayment, consuming it against an invoice)
 * are both driven from `domains/payments`' `ReceiptsService`
 * (`POST /payments/receipts` capturing an overpaying receipt;
 * `POST /payments/receipts/apply-student-credit`) — nothing here writes.
 * `billing:invoice:view` (an existing permission — no new code minted,
 * per this dispatch's own instruction to check the catalogue first) is the
 * closest fit: viewing a student's credit balance is the same class of
 * "student billing financial info" access as viewing their invoices.
 */
@ApiTags("billing-student-credit")
@Controller("billing/students")
export class StudentCreditController {
  constructor(private readonly studentCreditService: StudentCreditService) {}

  @Get(":studentId/credit-balance")
  @RequirePermission("billing:invoice:view")
  @ApiOperation({ summary: "Get a student's current Credit Balance (FR-PAY-004) — 0.0000 if they have never had one" })
  @ApiResponse({ status: 200, type: StudentCreditBalanceResponseDto })
  async getBalance(@Param("studentId") studentId: string): Promise<StudentCreditBalanceResponseDto> {
    const balance = await this.studentCreditService.getBalance(studentId);
    return { studentId, balance: balance.toDecimalString() };
  }
}
