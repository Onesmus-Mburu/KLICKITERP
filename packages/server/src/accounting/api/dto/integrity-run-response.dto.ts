import { ApiProperty } from "@nestjs/swagger";

export class IntegrityRunResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  ranAt!: Date;

  @ApiProperty()
  kind!: string;

  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ type: "object", additionalProperties: true })
  findings!: Record<string, unknown>;
}
