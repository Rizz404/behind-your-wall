import { IsDateString, IsIP, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBlockedIpDto {
  @IsIP()
  ip!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
