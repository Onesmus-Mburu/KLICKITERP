import { ApiProperty } from "@nestjs/swagger";

const DECISIONS = ["APPROVE", "REJECT", "RETURN"] as const;

export class ActionResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  instanceId!: string;

  @ApiProperty()
  levelSeq!: number;

  @ApiProperty({ format: "uuid" })
  actorId!: string;

  @ApiProperty({ enum: DECISIONS })
  decision!: (typeof DECISIONS)[number];

  @ApiProperty({ nullable: true, type: String })
  comment!: string | null;

  @ApiProperty()
  actedAt!: Date;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  wasDelegatedFrom!: string | null;
}
