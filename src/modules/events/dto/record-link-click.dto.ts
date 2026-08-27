// AFTER
import { IsUrl, IsString, IsNotEmpty } from 'class-validator';

export class RecordLinkClickDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsUrl()
  linkUrl: string;
}
