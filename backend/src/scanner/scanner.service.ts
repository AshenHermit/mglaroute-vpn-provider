import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as dns from 'dns';
import * as net from 'net';
import { Subscription, SubscriptionStatus } from '../subscriptions/subscription.entity';
import { Profile } from '../profiles/profile.entity';
import { OnlineService } from '../online-services/online-service.entity';
import { ScanHistory } from './scan-history.entity';
import { AnycastScore } from './anycast-scores.entity';
import { ParserService } from './parser.service';
import { LatencyService } from './latency.service';
import { ReachabilityService } from './reachability.service';
import { AnycastService } from './anycast.service';
import { XrayDelayService } from './xray-delay.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ProfilesService } from '../profiles/profiles.service';
import { SettingsService } from '../settings/settings.service';
import { markMissingParsedProfiles, upsertParsedProfiles } from './profile-upsert.helper';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private running = false;
  private lastScanAt: Date | null = null;
  private nextScanAt: Date | null = null;
  private lastScanResult: any = { profilesScanned: 0, succeeded: 0, failed: 0, details: [] };

  constructor(
    @InjectRepository(Subscription)
    private subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    @InjectRepository(OnlineService)
    private onlineServicesRepository: Repository<OnlineService>,
    @InjectRepository(ScanHistory)
    private scanHistoryRepository: Repository<ScanHistory>,
    private parserService: ParserService,
    private latencyService: LatencyService,
    private reachabilityService: ReachabilityService,
    private anycastService: AnycastService,
    private subscriptionsService: SubscriptionsService,
    private profilesService: ProfilesService,
    private settingsService: SettingsService,
    private xrayDelayService: XrayDelayService,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  getStatus() {
    return {
      running: this.running,
      lastScanAt: this.lastScanAt,
      nextScanAt: this.nextScanAt,
      lastScanResult: this.lastScanResult,
    };
  }

  async runScan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const results: any[] = [];
    try {
      const settings = await this.settingsService.getSettings();
      const concurrency = Math.max(1, settings?.concurrency ?? 10);
      const timeoutMs = settings?.timeoutMs ?? 5000;
      const intervalSeconds = settings?.intervalSeconds ?? 300;

      const subscriptions = await this.subscriptionsRepository.find({ where: { enabled: true } });
      for (const sub of subscriptions) {
        try {
          const subResults = await this.scanSubscription(sub, concurrency, timeoutMs, settings);
          results.push(...subResults);
        } catch (err: any) {
          this.logger.error(`Scan failed for subscription ${sub.id}: ${err?.message || err}`);
          await this.subscriptionsService.markFetchError(sub.id, err?.message || String(err));
        }
      }

      this.lastScanAt = new Date();
      this.nextScanAt = new Date(this.lastScanAt.getTime() + intervalSeconds * 1000);
      this.lastScanResult = {
        profilesScanned: results.length,
        succeeded: results.filter((r) => !r.error).length,
        failed: results.filter((r) => Boolean(r.error)).length,
        details: results,
      };
    } finally {
      this.running = false;
    }
  }

  private shouldRefresh(sub: Subscription): boolean {
    const interval = Number(sub.autoUpdateIntervalMinutes ?? 0);
    if (interval <= 0) return false;
    if (!sub.lastFetchedAt) return true;
    const elapsed = Date.now() - new Date(sub.lastFetchedAt).getTime();
    return elapsed >= interval * 60_000;
  }

  private async scanSubscription(sub: Subscription, concurrency: number, timeoutMs: number, settings: any): Promise<any[]> {
    let profiles: Profile[];

    if (this.shouldRefresh(sub)) {
      try {
        const response = await axios.get(sub.url, { timeout: timeoutMs, proxy: false });
        const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const { profiles: parsed } = this.parserService.parseSubscriptionText(text);
        profiles = await upsertParsedProfiles(this.profilesRepository, sub.id, parsed as Profile[]);
        await this.subscriptionsService.setServerCount(sub.id, parsed.length);
        await this.subscriptionsService.updateStatus(sub.id, SubscriptionStatus.ACTIVE);
        await markMissingParsedProfiles(this.profilesRepository, sub.id, profiles.map((p) => p.serverId));
      } catch (err: any) {
        this.logger.warn(`Fetch failed for subscription ${sub.id}: ${err?.message || err}`);
        await this.subscriptionsService.markFetchError(sub.id, err?.message || String(err));
        profiles = await this.profilesRepository.find({ where: { subscriptionId: sub.id } });
      }
    } else {
      profiles = await this.profilesRepository.find({ where: { subscriptionId: sub.id, present: true } });
    }

    const onlineServices = await this.onlineServicesRepository.find({ where: { isEnabled: true } });
    return this.scanProfiles(profiles, onlineServices, settings, timeoutMs, concurrency);
  }

  private async scanProfiles(
    profiles: Profile[],
    onlineServices: OnlineService[],
    settings: any,
    timeoutMs: number,
    concurrency: number,
  ): Promise<any[]> {
    const results: any[] = [];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, profiles.length || 1) }, async () => {
      while (cursor < profiles.length) {
        const profile = profiles[cursor++];
        try {
          results.push(await this.scanProfile(profile, onlineServices, settings, timeoutMs));
        } catch (err: any) {
          const message = err?.message || String(err);
          this.logger.warn(`Profile scan failed for ${profile.id}: ${message}`);
          results.push({ profileId: profile.id, latency: null, reachable: false, error: message });
        }
      }
    });
    await Promise.all(workers);
    return results;
  }

  private async scanProfile(
    profile: Profile,
    onlineServices: OnlineService[],
    settings: any,
    timeoutMs: number,
  ): Promise<any> {
    const useTcpOnly = settings?.delayMode === 'tcp' || !this.xrayDelayService.isAvailable();
    const latency = useTcpOnly
      ? await this.latencyService.measureLatency(profile.address, profile.port, timeoutMs)
      : await this.xrayDelayService.measureDelay(profile, timeoutMs);

    const resolvedIp = await this.resolveIp(profile.address);
    const urls = onlineServices.flatMap((service) => service.testUrls || []);
    const reachability = urls.length
      ? await this.reachabilityService.checkUrls(urls, timeoutMs)
      : {};

    profile.lastLatencyMs = latency as any;
    profile.lastReachable = latency !== null;
    profile.lastScannedAt = new Date();
    if (resolvedIp) {
      profile.rawConfig = { ...(profile.rawConfig || {}), resolvedIps: [resolvedIp] };
    }
    await this.profilesRepository.save(profile);

    if (resolvedIp) {
      for (const service of onlineServices) {
        for (const url of service.testUrls || []) {
          const entry = this.scanHistoryRepository.create({
            profileId: profile.id,
            onlineServiceId: service.id,
            latencyMs: latency ?? undefined,
            reachable: reachability[url] ?? false,
            resolvedIp,
          });
          await this.scanHistoryRepository.save(entry);
        }
      }

      const sampleCount = await this.scanHistoryRepository.count({ where: { profileId: profile.id, resolvedIp } });
      const score = await this.anycastService.computeAnycastScore(profile.id, resolvedIp);
      if (score !== null) {
        profile.anycastScore = score;
        profile.anycastSamples = sampleCount;
        await this.profilesRepository.save(profile);
        await this.anycastService.updateAnycastScore(profile.id, resolvedIp, score, sampleCount);
      }
    }

    return { profileId: profile.id, latency, reachable: latency !== null, resolvedIp };
  }

  private async resolveIp(address: string): Promise<string | null> {
    if (net.isIP(address)) return address;
    try {
      const addresses = await dns.promises.resolve4(address);
      return addresses[0] || null;
    } catch {
      try {
        const addresses = await dns.promises.resolve6(address);
        return addresses[0] || null;
      } catch {
        return null;
      }
    }
  }
}
