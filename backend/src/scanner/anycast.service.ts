import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AnycastScore } from './anycast-scores.entity';
import { Profile } from '../profiles/profile.entity';

export const ANYCAST_WINDOW_SIZE = 10;

export interface AnycastCheckObservation {
  fingerprint: string | null;
  reachableCount: number;
  expectedCount: number;
}

const AUTO_PATTERN = /anycast|auto/i;

@Injectable()
export class AnycastService {
  constructor(
    @InjectRepository(AnycastScore)
    private anycastScoreRepository: Repository<AnycastScore>,
  ) {}

  applyScore(profile: Profile, observation: AnycastCheckObservation | null): number {
    let window = Array.isArray(profile.anycastWindow) ? [...profile.anycastWindow] : [];

    if (observation) {
      if (observation.fingerprint !== profile.servicesFingerprint) {
        window = [];
        profile.servicesFingerprint = observation.fingerprint;
      }
      if (observation.expectedCount > 0) {
        window.push(observation.reachableCount < observation.expectedCount);
      }
    }

    if (window.length > ANYCAST_WINDOW_SIZE) {
      window = window.slice(window.length - ANYCAST_WINDOW_SIZE);
    }

    profile.anycastWindow = window;
    profile.anycastSamples = window.length;

    const forced = AUTO_PATTERN.test(`${profile.remarks || ''} ${profile.name || ''}`);
    const losses = window.filter(Boolean).length;
    const score = forced ? 1 : window.length === 0 ? 0 : Math.round((losses / window.length) * 100) / 100;
    profile.anycastScore = score;
    return score;
  }

  async updateAnycastScore(
    profileId: string,
    resolvedIp: string,
    score: number,
    sampleCount: number,
  ): Promise<void> {
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
