import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: "The account's current password" })
  @IsNotEmpty({ message: 'Current password is required.' })
  @IsString({ message: 'Current password must be a string.' })
  @MaxLength(128, {
    message: 'Current password must be at most 128 characters long.',
  })
  currentPassword: string;

  @ApiProperty({
    description:
      'Min 8 chars, at least one uppercase letter, one number, one special character.',
    minLength: 8,
    maxLength: 128,
  })
  @IsNotEmpty({ message: 'Password is required.' })
  @IsString({ message: 'Password must be a string.' })
  @MinLength(8, {
    message: 'Password must be at least 8 characters long.',
  })
  @MaxLength(128, {
    message: 'Password must be at most 128 characters long.',
  })
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'Password must include at least one uppercase letter, one number, and one special character.',
  })
  newPassword: string;
}
