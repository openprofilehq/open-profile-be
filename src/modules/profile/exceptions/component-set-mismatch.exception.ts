import { ConflictException } from '@nestjs/common';

/**
 * Thrown when the IDs submitted to PUT /profiles/me/components/order
 * don't match the profile's current component set exactly. Response
 * body includes the diff so the client can refetch and retry.
 */
export class ComponentSetMismatchException extends ConflictException {
  constructor(missing: string[], extra: string[]) {
    super({
      error: 'COMPONENT_SET_MISMATCH',
      message: 'Submitted component IDs do not match the profile current set.',
      missing,
      extra,
    });
  }
}
