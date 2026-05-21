import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class PublishProfileDto {
  @ApiProperty({
    enum: ['publish', 'unpublish'],
    description: 'The publish action to execute.',
    example: 'publish',
  })
  @IsString()
  @IsNotEmpty({
    message: 'Please specify an action: "publish" or "unpublish".',
  })
  @IsIn(['publish', 'unpublish'], {
    message: 'Action must be "publish" or "unpublish".',
  })
  action: 'publish' | 'unpublish';
}
