import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordProfileViewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  username: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  src?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  referrerSearchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;
}
