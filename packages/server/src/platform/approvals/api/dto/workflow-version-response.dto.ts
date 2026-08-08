import { ApiProperty } from "@nestjs/swagger";

export class WorkflowVersionResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  workflowDefId!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  isCurrent!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
