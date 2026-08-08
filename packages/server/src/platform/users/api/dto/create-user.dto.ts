import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";
import { UsrUserType } from "../../domain/usr-user.entity";

export class CreateUserDto {
  @ApiProperty({ minLength: 3, maxLength: 60 })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  username!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ description: "E.164, e.g. +254700000000" })
  @IsOptional()
  @Matches(/^\+\d{6,19}$/, { message: "phone must be E.164, e.g. +254700000000" })
  phone?: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ enum: ["STAFF", "PARENT", "SYSTEM"] })
  @IsOptional()
  @IsIn(["STAFF", "PARENT", "SYSTEM"])
  userType?: UsrUserType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ default: "en" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;
}
