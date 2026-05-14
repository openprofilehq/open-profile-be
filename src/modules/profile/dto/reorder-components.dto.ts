import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

/**
 * Body for PUT /profiles/me/components/order.
 *
 * Array order = new top-to-bottom display order. Server assigns
 * displayOrder = index in one transaction.
 *
 * Bounds: ArrayMaxSize(100) is a DoS safety bound; profiles cap well
 * below this in practice and unbounded arrays are an attack vector.
 */
export class ReorderComponentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  componentIds: string[];
}
