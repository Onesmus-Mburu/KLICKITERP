import { ApiProperty } from "@nestjs/swagger";

export class WorkflowDefResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 30 })
  domainCode!: string;

  @ApiProperty({ maxLength: 80 })
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty()
  version!: number;
}
