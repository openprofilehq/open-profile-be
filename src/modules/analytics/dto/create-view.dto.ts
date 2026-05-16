import { IsUUID, IsOptional, IsString } from 'class-validator';

export class CreateViewDto {
  @IsUUID()
  profileId: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  viewerIp?: string;
}