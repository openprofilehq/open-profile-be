import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { UserStatusAction } from '../constants/status-transitions';

export const USER_SEARCH_MIN_LENGTH = 2;
export const USER_SEARCH_DEFAULT_PAGE = 1;
export const USER_SEARCH_DEFAULT_LIMIT = 10;
export const USER_SEARCH_MAX_LIMIT = 50;

export class AdminUsersQueryDto {
  @ApiProperty({
    example: 'john',
    minLength: USER_SEARCH_MIN_LENGTH,
    description:
      'Search term matched against the user full name or username ' +
      '(case-insensitive).',
  })
  @IsString()
  @Length(USER_SEARCH_MIN_LENGTH)
  q: string;

  @ApiPropertyOptional({
    example: USER_SEARCH_DEFAULT_PAGE,
    default: USER_SEARCH_DEFAULT_PAGE,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: USER_SEARCH_DEFAULT_LIMIT,
    default: USER_SEARCH_DEFAULT_LIMIT,
    minimum: 1,
    maximum: USER_SEARCH_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USER_SEARCH_MAX_LIMIT)
  limit?: number;
}

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: UserStatusAction,
    description: 'Status action to apply to the user.',
  })
  @IsEnum(UserStatusAction)
  action: UserStatusAction;
}
