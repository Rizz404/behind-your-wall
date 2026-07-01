import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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

  // Classic User-Agent string
  @IsOptional()
  @IsString()
  userAgent?: string;

  // Parsed from userAgent string (widget-side)
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

  // FingerprintJS canvas/webgl/audio hashes
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

  // User-Agent Client Hints (navigator.userAgentData)
  @IsOptional()
  @IsArray()
  uaBrands?: Array<{ brand: string; version: string }>;

  @IsOptional()
  @IsBoolean()
  uaMobile?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  uaPlatform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  uaPlatformVersion?: string;

  @IsOptional()
  @IsObject()
  uaChRaw?: Record<string, unknown>;

  // HTML5 Geolocation API (navigator.geolocation)
  @IsOptional()
  @IsNumber()
  geoLat?: number;

  @IsOptional()
  @IsNumber()
  geoLon?: number;

  @IsOptional()
  @IsNumber()
  geoAccuracy?: number;
}
