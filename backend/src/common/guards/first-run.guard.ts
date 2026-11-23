import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirstRunService } from '../../auth/first-run.service';

@Injectable()
export class FirstRunGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private firstRunService: FirstRunService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path = request.url;

    // Allow auth routes and health check
    if (path.startsWith('/auth') || path.startsWith('/health')) {
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