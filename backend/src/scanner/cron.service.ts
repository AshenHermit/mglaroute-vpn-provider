import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScannerService } from './scanner.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  private lastScanAt?: Date;
  private nextScanAt?: Date;

  constructor(
    private scannerService: ScannerService,
    private settingsService: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    const settings = await this.settingsService.getSettings();
    if (!settings?.enabled) return;

    const intervalMs = (settings.intervalSeconds ?? 300) * 1000;
    const now = Date.now();
    if (this.lastScanAt && now - this.lastScanAt.getTime() < intervalMs) return;

    this.logger.log(`Cron triggered (interval: ${settings.intervalSeconds ?? 300}s)`);
    await this.scannerService.runScan();
    this.lastScanAt = new Date();
    this.nextScanAt = new Date(Date.now() + intervalMs);
  }
}