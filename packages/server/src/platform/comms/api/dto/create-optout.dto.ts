import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, IsUUID, MaxLength } from "class-validator";
import { COMM_CHANNELS, CommChannel } from "../../domain/comm-template.entity";

export class CreateOptoutDto {
  @ApiProperty({ format: "uuid", description: "Bare uuid — no FK yet (students/guardians module, #8, not built)" })
  @IsUUID()
  guardianId!: string;

  @ApiProperty({ enum: COMM_CHANNELS })
  @IsIn(COMM_CHANNELS)
  channel!: CommChannel;

  @ApiProperty({ maxLength: 30, example: "ALL" })
  @IsString()
  @MaxLength(30)
  scope!: string;
}
