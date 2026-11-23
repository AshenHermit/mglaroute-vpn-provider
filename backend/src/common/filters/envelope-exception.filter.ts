import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class EnvelopeExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        code = (res as any).code || (res as any).error || 'HTTP_ERROR';
        message = (res as any).message || exception.message;
      } else {
        code = 'HTTP_ERROR';
        message = String(res);
      }
    } else if (exception?.message) {
      message = exception.message;
    }

    response.status(status).json({
      ok: false,
      code,
      message,
    });
  }
}