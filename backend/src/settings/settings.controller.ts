import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  async get() {
    return this.settingsService.getSettings();
  }

  @Put()
  async update(@Body() updates: UpdateSettingsDto) {
    return this.settingsService.updateSettings(updates);
  }
}