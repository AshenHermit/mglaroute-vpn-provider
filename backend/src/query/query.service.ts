import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull } from 'typeorm';
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
    qb.andWhere('profile.present = :present', { present: true });

    // Search filter
    if (dto.search) {
      qb.andWhere(
        '(profile.remarks ILIKE :search OR profile.name ILIKE :search OR profile.address ILIKE :search)',
        { search: `%${dto.search}%` },
      );
    }

    // Protocol filter
    if (dto.protocol) {
      qb.andWhere('profile.protocol = :protocol', { protocol: dto.protocol });
    }

    // Reachability filter
    if (dto.reachable !== undefined) {
      qb.andWhere('profile.lastReachable = :reachable', { reachable: dto.reachable });
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
      case 'name_asc':
        qb.orderBy('profile.name', 'ASC', 'NULLS LAST');
        break;
      case 'name_desc':
        qb.orderBy('profile.name', 'DESC', 'NULLS LAST');
        break;
      case 'address_asc':
        qb.orderBy('profile.address', 'ASC', 'NULLS LAST');
        break;
      case 'address_desc':
        qb.orderBy('profile.address', 'DESC', 'NULLS LAST');
        break;
      case 'port_asc':
        qb.orderBy('profile.port', 'ASC', 'NULLS LAST');
        break;
      case 'port_desc':
        qb.orderBy('profile.port', 'DESC', 'NULLS LAST');
        break;
      case 'protocol_asc':
        qb.orderBy('profile.protocol', 'ASC', 'NULLS LAST');
        break;
      case 'protocol_desc':
        qb.orderBy('profile.protocol', 'DESC', 'NULLS LAST');
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
      remarks: p.remarks,
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