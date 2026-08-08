import { ApiProperty } from "@nestjs/swagger";

export class DelegationResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  fromUserId!: string;

  @ApiProperty({ format: "uuid" })
  toUserId!: string;

  @ApiProperty({ type: String, format: "date" })
  startsOn!: string;

  @ApiProperty({ type: String, format: "date" })
  endsOn!: string;

  @ApiProperty({ nullable: true, type: String })
  reason!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
