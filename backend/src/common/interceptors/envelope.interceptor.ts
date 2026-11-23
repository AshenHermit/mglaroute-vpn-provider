import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface EnvelopeResponse<T> {
  ok: boolean;
  code?: string;
  message?: string;
  data?: T;
}

@Injectable()
export class EnvelopeInterceptor<T> implements NestInterceptor<T, EnvelopeResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<EnvelopeResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        ok: true,
        data,
      })),
      catchError((error) => {
        let code: string;
        let message: string;
        let status: HttpStatus;

        if (error instanceof HttpException) {
          status = error.getStatus();
          const response = error.getResponse();
          if (typeof response === 'object' && response !== null) {
            const res = response as any;
            code = res.code || res.error || 'HTTP_ERROR';
            message = res.message || error.message;
          } else {
            code = 'HTTP_ERROR';
            message = String(response);
          }
        } else {
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          code = 'INTERNAL_ERROR';
          message = error?.message || 'An unexpected error occurred';
        }

        const response = context.switchToHttp().getResponse();
        response.status(status);

        return throwError(() => ({
          ok: false,
          code,
          message,
        }));
      }),
    );
  }
}