import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScannerService } from './scanner.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private scannerService: ScannerService,
    private settingsService: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    const settings = await this.settingsService.getSettings();
    const interval = settings?.intervalSeconds ?? 300;
    this.logger.log(`Cron triggered (interval: ${interval}s)`);
    await this.scannerService.runScan();
  }
}