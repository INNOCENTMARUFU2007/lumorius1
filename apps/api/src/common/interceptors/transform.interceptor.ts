import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

/** Marks an endpoint whose response must bypass the standard JSON envelope. */
export const RAW_API_RESPONSE_METADATA = 'lumorius:raw-api-response';
export const RawApiResponse = () => SetMetadata(RAW_API_RESPONSE_METADATA, true);

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | T> {
    const handlerRequiresRawResponse =
      Reflect.getMetadata(RAW_API_RESPONSE_METADATA, context.getHandler()) === true;

    return next.handle().pipe(
      map((data): ApiResponse<T> | T => {
        // Preserve file/binary payloads even if a route is not explicitly marked.
        // Explicit route metadata also supports downloads such as CSV that return text.
        if (handlerRequiresRawResponse || data instanceof Uint8Array) {
          return data as T;
        }

        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}