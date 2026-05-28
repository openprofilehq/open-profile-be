import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Min, MaxLength, MinLength } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @MinLength(3, { message: 'Please enter at least 3 characters to search.' })
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  q: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit: number = 5;
}
