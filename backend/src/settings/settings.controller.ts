import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { ScannerSettings } from './settings.entity';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  async get() {
    return this.settingsService.getSettings();
  }

  @Put()
  async update(@Body() updates: Partial<ScannerSettings>) {
    return this.settingsService.updateSettings(updates);
  }
}