import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateEmailDto {
  @ApiProperty({ example: 'newemail@example.com' })
  @IsNotEmpty({ message: 'Email address is required.' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MaxLength(255, { message: 'Email must be at most 255 characters.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;
}
