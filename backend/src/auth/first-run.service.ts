import { Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class FirstRunService {
  constructor(private authService: AuthService) {}

  async isFirstRun(): Promise<boolean> {
    return !(await this.authService.userExists());
  }
}