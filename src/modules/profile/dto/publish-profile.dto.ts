import { IsNotEmpty, IsString } from 'class-validator';

export class PublishProfileDto {
  @IsString()
  @IsNotEmpty({
    message: 'Please specify an action: publish or unpublish.',
  })
  action: string;
}
