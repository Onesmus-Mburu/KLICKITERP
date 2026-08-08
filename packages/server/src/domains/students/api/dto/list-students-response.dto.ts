import { ApiProperty } from "@nestjs/swagger";
import { StudentResponseDto } from "./student-response.dto";

/**
 * Phase 6 Slice 2c — real server-side pagination for `StudentsController.list()`
 * (Students only — see `StudentsService.list()`'s own doc comment for the
 * scope note on why the other 5 Students-module list endpoints were
 * deliberately left alone this pass). A flat `{items, total}` shape, no
 * `meta` envelope — mirrors `UsersController.list()`/`UsersService.list()`,
 * the one real pagination precedent already in this codebase, for
 * consistency (that endpoint returns the same shape without a formal
 * response DTO; this one gets a real DTO since every other endpoint on this
 * exact controller already has one).
 */
export class ListStudentsResponseDto {
  @ApiProperty({ type: [StudentResponseDto] })
  items!: StudentResponseDto[];

  @ApiProperty({ description: "Total row count matching the applied filters, ignoring page/pageSize" })
  total!: number;
}
