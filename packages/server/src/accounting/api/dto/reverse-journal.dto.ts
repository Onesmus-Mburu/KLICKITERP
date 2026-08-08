import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class ReverseJournalDto {
  @ApiProperty()
  @IsString()
  narration!: string;
}
