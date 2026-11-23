import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ScanHistory } from './scan-history.entity';
import { AnycastScore } from './anycast-scores.entity';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class AnycastService {
  constructor(
    @InjectRepository(ScanHistory)
    private scanHistoryRepository: Repository<ScanHistory>,
    @InjectRepository(AnycastScore)
    private anycastScoreRepository: Repository<AnycastScore>,
    private settingsService: SettingsService,
  ) {}

  async computeAnycastScore(profileId: string, resolvedIp: string): Promise<number | null> {
    const settings = await this.settingsService.getSettings();
    const minSamples = settings?.anycastMinSamples ?? 3;

    const history = await this.scanHistoryRepository.find({
      where: { profileId, resolvedIp },
      order: { scannedAt: 'DESC' },
    });

    const sampleCount = history.length;
    if (sampleCount < minSamples) return null;

    const uniqueIps = new Set(history.map((h) => h.resolvedIp)).size;
    const confidence = 1 - uniqueIps / sampleCount;
    return Math.max(0, Math.min(1, confidence));
  }

  async updateAnycastScore(profileId: string, resolvedIp: string, score: number | null, sampleCount: number): Promise<void> {
    if (score === null) return;
    const existing = await this.anycastScoreRepository.findOne({
      where: { profileId, resolvedIp },
    });
    if (existing) {
      existing.score = score;
      existing.sampleCount = sampleCount;
      existing.lastUpdated = new Date();
      await this.anycastScoreRepository.save(existing);
    } else {
      const entry = this.anycastScoreRepository.create({
        profileId,
        resolvedIp,
        score,
        sampleCount,
        lastUpdated: new Date(),
      });
      await this.anycastScoreRepository.save(entry);
    }
  }
}