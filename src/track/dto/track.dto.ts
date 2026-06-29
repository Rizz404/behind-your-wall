import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fingerprintId!: string;

  @IsOptional()
  @IsString()
  pageUrl?: string;

  @IsOptional()
  @IsString()
  referrer?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  browser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  os?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  deviceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  screenRes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsString()
  canvasHash?: string;

  @IsOptional()
  @IsString()
  webglHash?: string;

  @IsOptional()
  @IsString()
  audioHash?: string;

  @IsOptional()
  @IsObject()
  rawComponents?: Record<string, unknown>;
}
