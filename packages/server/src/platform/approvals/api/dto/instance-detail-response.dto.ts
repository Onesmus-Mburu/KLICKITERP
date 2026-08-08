import { ApiProperty } from "@nestjs/swagger";
import { ActionResponseDto } from "./action-response.dto";
import { InstanceResponseDto } from "./instance-response.dto";

export class InstanceDetailResponseDto extends InstanceResponseDto {
  @ApiProperty({ type: [ActionResponseDto], description: "Full decision trail (FR-APPR-003)" })
  actions!: ActionResponseDto[];
}
