import { IsUrl, IsUUID } from 'class-validator';

export class RecordLinkClickDto {
  @IsUUID()
  profileId: string;

  @IsUrl()
  linkUrl: string;
}
