import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull } from 'typeorm';
import { Profile } from '../profiles/profile.entity';
import { AnycastScore } from '../scanner/anycast-scores.entity';
import { ScannerSettings } from '../settings/settings.entity';
import { applyServerFilters, applyServerSort } from './server-filter';

@Injectable()
export class QueryService {
  constructor(
    @InjectRepository(Profile)
    private profileRepository: Repository<Profile>,
    @InjectRepository(AnycastScore)
    private anycastScoreRepository: Repository<AnycastScore>,
    @InjectRepository(ScannerSettings)
    private settingsRepository: Repository<ScannerSettings>,
  ) {}

  async queryServers(dto: any) {
    const page = dto.page || 1;
    const limit = Math.min(dto.limit || 20, 100);
    const offset = (page - 1) * limit;

    const settings = await this.settingsRepository.findOne({ where: { id: 'singleton' } });
    const threshold = settings?.anycastThreshold || 0.5;

    const qb = this.profileRepository.createQueryBuilder('profile');
    applyServerFilters(qb, dto, threshold);
    applyServerSort(qb, dto.sort);

    const [profiles, total] = await qb
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const servers = profiles.map((p) => ({
      id: p.id,
      address: p.address,
      port: p.port,
      protocol: p.protocol,
      name: p.name,
      remarks: p.remarks,
      latency: p.lastLatencyMs,
      reachable: p.lastReachable,
      anycastConfidence: p.anycastScore,
      anycastSampleCount: p.anycastSamples,
      lastScannedAt: p.lastScannedAt,
      services: p.serviceIds ?? [],
      servicesCheckedAt: p.servicesCheckedAt ? p.servicesCheckedAt.toISOString() : null,
    }));

    return {
      servers,
      total,
      page,
      limit,
    };
  }

  async getAnycastList() {
    const profiles = await this.profileRepository.find({
      where: { anycastScore: Not(IsNull()), present: true },
      order: { anycastScore: 'DESC' },
    });

    if (profiles.length === 0) {
      return [];
    }

    const scores = await this.anycastScoreRepository.find({
      where: { profileId: In(profiles.map((profile) => profile.id)) },
      order: { lastUpdated: 'DESC' },
    });

    const latestIpByProfile = new Map<string, string>();
    for (const score of scores) {
      if (!latestIpByProfile.has(score.profileId)) {
        latestIpByProfile.set(score.profileId, score.resolvedIp);
      }
    }

    return profiles.map((profile) => ({
      id: profile.id,
      profileId: profile.id,
      profileName: profile.name,
      resolvedIp: latestIpByProfile.get(profile.id) || profile.address,
      score: Number(profile.anycastScore),
      sampleCount: profile.anycastSamples,
      lastUpdated: profile.lastScannedAt || profile.updatedAt,
      createdAt: profile.createdAt,
    }));
  }

  async getAnycastDetail(profileId: string) {
    const profile = await this.profileRepository.findOne({ where: { id: profileId } });
    if (!profile) {
      return null;
    }

    const scores = await this.anycastScoreRepository.find({
      where: { profileId },
      order: { lastUpdated: 'DESC' },
    });

    const uniqueIps = new Set(scores.map((s) => s.resolvedIp));

    return {
      profileId: profile.id,
      confidence: profile.anycastScore,
      sampleCount: profile.anycastSamples,
      uniqueIpCount: uniqueIps.size,
      resolvedIps: scores.map((s) => ({
        ip: s.resolvedIp,
        score: s.score,
        sampleCount: s.sampleCount,
        lastUpdated: s.lastUpdated,
      })),
      lastUpdated: profile.lastScannedAt,
    };
  }
}