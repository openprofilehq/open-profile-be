import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((payload) => {
        if (payload && typeof payload === 'object') {
          const status = (payload as Record<string, unknown>).status;
          if (
            status === 'success' ||
            status === 'pending' ||
            status === 'error'
          ) {
            return payload as unknown as ApiResponse<T>;
          }
          if ('paginationMeta' in (payload as object)) {
            const {
              paginationMeta,
              payload: data,
              ...rest
            } = payload as unknown as {
              paginationMeta: Record<string, unknown>;
              payload: T;
              [key: string]: unknown;
            };
            return {
              success: true,
              data: data,
              meta: { ...rest, ...paginationMeta },
            };
          }
        }
        return { success: true, data: payload };
      }),
    );
  }
}
