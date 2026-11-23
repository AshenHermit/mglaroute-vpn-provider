import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirstRunService } from '../../auth/first-run.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class FirstRunGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private firstRunService: FirstRunService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const path = request.url;

    // Allow auth routes and health check (with /api prefix)
    if (path.startsWith('/api/auth') || path.startsWith('/api/health')) {
      return true;
    }

    const isFirstRun = await this.firstRunService.isFirstRun();
    if (isFirstRun) {
      throw new ForbiddenException({
        code: 'SETUP_REQUIRED',
        message: 'Initial setup required',
      });
    }

    return true;
  }
}