import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { UsrUserStatus } from "../../domain/usr-user.entity";

export class ChangeUserStatusDto {
  @ApiProperty({ enum: ["ACTIVE", "SUSPENDED", "DEACTIVATED"] })
  @IsIn(["ACTIVE", "SUSPENDED", "DEACTIVATED"])
  status!: UsrUserStatus;
}
