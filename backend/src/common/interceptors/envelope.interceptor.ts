import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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
    );
  }
}