import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-z0-9.-]+$/i, { message: 'domain must be a bare hostname (no protocol/path)' })
  domain!: string;
}
