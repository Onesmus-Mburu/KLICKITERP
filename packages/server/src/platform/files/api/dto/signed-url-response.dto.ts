import { ApiProperty } from "@nestjs/swagger";

export class SignedUrlResponseDto {
  @ApiProperty()
  url!: string;

  @ApiProperty()
  expiresInSeconds!: number;
}
