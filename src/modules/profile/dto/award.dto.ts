import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAwardDto {
  @ApiProperty({ example: 'Best Backend Engineer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({ example: 'HNG Internship' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  issuer: string;

  @ApiProperty({ example: '2024-06-15' })
  @IsDateString()
  awardDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'https://credential.example.com/verify/abc123',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  credentialUrl?: string;
}

export class UpdateAwardDto {
  @ApiProperty({ example: 'Best Backend Engineer', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title?: string;

  @ApiProperty({ example: 'HNG Internship', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  issuer?: string;

  @ApiProperty({ example: '2024-06-15', required: false })
  @IsOptional()
  @IsDateString()
  awardDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'https://credential.example.com/verify/abc123',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  credentialUrl?: string;
}

export class ReorderAwardsDto {
  @ApiProperty({ type: [String], example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsUUID('4', { each: true })
  awardIds: string[];
}
