import { IsEmail, IsString, IsOptional, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiPropertyOptional({ description: '6-digit TOTP code if MFA is enabled' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  mfaCode?: string;
}
