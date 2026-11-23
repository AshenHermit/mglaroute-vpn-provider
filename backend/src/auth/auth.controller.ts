import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { FirstRunService } from './first-run.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

export class SetupDto {
  username: string;
  password: string;
}

export class LoginDto {
  username: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private firstRunService: FirstRunService,
  ) {}

  @Get('first-run')
  @Public()
  async firstRun() {
    const isFirstRun = await this.firstRunService.isFirstRun();
    return { isFirstRun };
  }

  @Post('setup')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async setup(@Body() dto: SetupDto) {
    const isFirstRun = await this.firstRunService.isFirstRun();
    if (!isFirstRun) {
      throw new HttpException(
        { code: 'SETUP_DONE', message: 'Setup already completed' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.authService.createUser(dto.username, dto.password);
    const result = await this.authService.login(dto.username, dto.password);
    return result;
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: any) {
    return user;
  }
}