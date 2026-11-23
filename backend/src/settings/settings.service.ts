import { Injectable, OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ScannerSettings } from './settings.entity';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @InjectRepository(ScannerSettings)
    private settingsRepository: Repository<ScannerSettings>,
  ) {}

  async onModuleInit() {
    // Ensure singleton exists
    const existing = await this.settingsRepository.findOne({ where: { id: 'singleton' } });
    if (!existing) {
      const defaults = this.settingsRepository.create({
        id: 'singleton',
        intervalSeconds: 300,
        concurrency: 10,
        timeoutMs: 5000,
        anycastMinSamples: 3,
        anycastThreshold: 0.5,
      });
      await this.settingsRepository.save(defaults);
    }
  }

  async getSettings(): Promise<ScannerSettings | null> {
    return this.settingsRepository.findOne({ where: { id: 'singleton' } });
  }

  async updateSettings(updates: Partial<ScannerSettings>): Promise<ScannerSettings | null> {
    await this.settingsRepository.update('singleton', updates);
    return this.getSettings();
  }
}