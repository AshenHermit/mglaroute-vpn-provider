import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Profile } from '../profiles/profile.entity';
import { AnycastScore } from '../scanner/anycast-scores.entity';
import { ScannerSettings } from '../settings/settings.entity';
import { OnlineServicesService } from '../online-services/online-services.service';
import { applyServerFilters, applyServerSort } from '../query/server-filter';
import { FeedQueryDto } from './dto/feed-query.dto';
import { buildProfileLink } from './subscription-link.builder';

export interface FeedResult {
  body: string;
  contentType: 'application/json' | 'text/plain; charset=utf-8';
}

export interface FeedServiceEntry {
  id: string;
  name: string;
}

function iso(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

@Injectable()
export class FeedService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(AnycastScore)
    private readonly anycastScoreRepository: Repository<AnycastScore>,
    @InjectRepository(ScannerSettings)
    private readonly settingsRepository: Repository<ScannerSettings>,
    private readonly onlineServicesService: OnlineServicesService,
  ) {}

  async listPublicServices(): Promise<FeedServiceEntry[]> {
    const rows = await this.onlineServicesService.getEnabled();
    return rows.map(({ id, name }) => ({ id, name }));
  }

  async generate(dto: FeedQueryDto): Promise<FeedResult> {
    const settings = await this.settingsRepository.findOne({ where: { id: 'singleton' } });
    const threshold = Number(settings?.anycastThreshold ?? 0.5);

    const qb = this.profileRepository.createQueryBuilder('profile');
    qb.innerJoin('profile.subscription', 'subscription');
    qb.andWhere('subscription.status = :status', { status: 'active' });
    qb.andWhere('subscription.enabled = :enabled', { enabled: true });
    applyServerFilters(qb, dto, threshold);
    applyServerSort(qb, dto.sort);
    qb.take(dto.limit ?? 200);

    const profiles = await qb.getMany();
    const resolvedIps = await this.resolveIps(profiles.map((p) => p.id));

    const links: string[] = [];
    const servers: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let skipped = 0;

    for (const profile of profiles) {
      const link = buildProfileLink(profile);
      if (!link || seen.has(link)) {
        skipped++;
        continue;
      }
      seen.add(link);
      links.push(link);
      servers.push({
        id: profile.id,
        name: profile.name,
        remarks: profile.remarks ?? null,
        protocol: profile.protocol,
        address: profile.address,
        port: profile.port,
        link,
        latencyMs: profile.lastLatencyMs ?? null,
        reachable: profile.lastReachable ?? null,
        anycastConfidence: profile.anycastScore === null || profile.anycastScore === undefined
          ? null
          : Number(profile.anycastScore),
        anycastSamples: profile.anycastSamples ?? 0,
        resolvedIp: resolvedIps.get(profile.id) ?? null,
        lastScannedAt: iso(profile.lastScannedAt),
        services: profile.serviceIds ?? [],
        servicesCheckedAt: iso(profile.servicesCheckedAt),
      });
    }

    if (dto.format === 'json') {
      return {
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          count: servers.length,
          skipped,
          servers,
        }),
        contentType: 'application/json',
      };
    }

    return {
      body: links.length ? `${links.join('\n')}\n` : '',
      contentType: 'text/plain; charset=utf-8',
    };
  }

  private async resolveIps(profileIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!profileIds.length) return result;
    const rows = await this.anycastScoreRepository.find({
      where: { profileId: In(profileIds) },
      order: { lastUpdated: 'DESC' },
    });
    rows.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
    for (const row of rows) {
      if (!result.has(row.profileId)) result.set(row.profileId, row.resolvedIp);
    }
    return result;
  }
}
