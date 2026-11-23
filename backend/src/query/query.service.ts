import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { Profile } from '../profiles/profile.entity';
import { AnycastScore } from '../scanner/anycast-scores.entity';
import { ScannerSettings } from '../settings/settings.entity';

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

    // Search filter
    if (dto.search) {
      qb.andWhere('profile.address ILIKE :search', { search: `%${dto.search}%` });
    }

    // Anycast filter
    if (dto.anycast !== undefined) {
      if (dto.anycast === true) {
        qb.andWhere('profile.anycastScore >= :threshold', { threshold });
      } else {
        qb.andWhere('(profile.anycastScore < :threshold OR profile.anycastScore IS NULL)', { threshold });
      }
    }

    // Sort
    switch (dto.sort) {
      case 'latency_asc':
        qb.orderBy('profile.lastLatencyMs', 'ASC', 'NULLS LAST');
        break;
      case 'latency_desc':
        qb.orderBy('profile.lastLatencyMs', 'DESC', 'NULLS LAST');
        break;
      case 'confidence_desc':
        qb.orderBy('profile.anycastScore', 'DESC', 'NULLS LAST');
        break;
      case 'confidence_asc':
        qb.orderBy('profile.anycastScore', 'ASC', 'NULLS LAST');
        break;
      default:
        qb.orderBy('profile.lastLatencyMs', 'ASC', 'NULLS LAST');
    }

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
      latency: p.lastLatencyMs,
      reachable: p.lastReachable,
      anycastConfidence: p.anycastScore,
      anycastSampleCount: p.anycastSamples,
      lastScannedAt: p.lastScannedAt,
    }));

    return {
      servers,
      total,
      page,
      limit,
    };
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