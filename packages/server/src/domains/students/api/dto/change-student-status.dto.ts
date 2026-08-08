import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { STD_STUDENT_STATUSES, StdStudentStatus } from "../../domain/std-student.entity";

export class ChangeStudentStatusDto {
  @ApiProperty({ enum: STD_STUDENT_STATUSES })
  @IsIn(STD_STUDENT_STATUSES)
  status!: StdStudentStatus;
}
