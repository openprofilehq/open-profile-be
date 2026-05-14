import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Body for PATCH /profiles/me/components/:componentId.
 *
 * Note: `displayOrder` is intentionally NOT included here. The global
 * ValidationPipe's `forbidNonWhitelisted: true` will reject any request
 * that includes it, returning 422. Display order changes only happen
 * via PUT /profiles/me/components/order.
 */
export class PatchComponentDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
