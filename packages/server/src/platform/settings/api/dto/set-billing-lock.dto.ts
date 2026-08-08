import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class SetBillingLockDto {
  @ApiProperty()
  @IsBoolean()
  locked!: boolean;
}
