import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EnableMfaDto {
  @ApiProperty({ description: '6-digit TOTP verification code' })
  @IsString()
  @Length(6, 6)
  code: string;
}
