import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubscriptionStatus } from '../subscriptions/subscription.entity';
import { Profile, Protocol } from '../profiles/profile.entity';
import { OnlineService } from '../online-services/online-service.entity';
import { ScanHistory } from './scan-history.entity';
import { AnycastScore } from './anycast-scores.entity';
import { ParserService } from './parser.service';
import { LatencyService } from './latency.service';
import { ReachabilityService } from './reachability.service';
import { AnycastService } from './anycast.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ProfilesService } from '../profiles/profiles.service';
import { SettingsService } from '../settings/settings.service';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import * as dns from 'dns';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private running = false;
  private lastScanAt: Date | null = null;
  private lastScanResult: any = null;

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
    private httpService: HttpService,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  getStatus() {
    return {
      running: this.running,
      lastScanAt: this.lastScanAt,
      lastScanResult: this.lastScanResult,
    };
  }

  async runScan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const results: any[] = [];
    try {
      const settings = await this.settingsService.getSettings();
      const concurrency = settings?.concurrency ?? 10;
      const timeoutMs = settings?.timeoutMs ?? 5000;

      const subscriptions = await this.subscriptionsRepository.find({ where: { status: SubscriptionStatus.ACTIVE } });

      for (const sub of subscriptions) {
        try {
          await this.scanSubscription(sub, settings, concurrency, timeoutMs, results);
        } catch (err) {
          this.logger.error(`Scan failed for subscription ${sub.id}: ${err.message}`);
          await this.subscriptionsService.updateStatus(sub.id, SubscriptionStatus.ERROR, err.message);
        }
      }

      this.lastScanAt = new Date();
      this.lastScanResult = { profilesScanned: results.length, details: results };
    } finally {
      this.running = false;
    }
  }

  private async scanSubscription(sub: Subscription, settings: any, concurrency: number, timeoutMs: number, results: any[]): Promise<void> {
    // Fetch subscription
    let text: string;
    try {
      const resp = await axios.get(sub.url, { timeout: timeoutMs });
      text = resp.data;
    } catch (err) {
      await this.subscriptionsService.updateStatus(sub.id, SubscriptionStatus.ERROR, err.message);
      return;
    }

    const { profiles: parsedProfiles, skipped } = this.parserService.parseSubscriptionText(text);

    // Save profiles
    const savedProfiles: Profile[] = [];
    for (const p of parsedProfiles) {
      const profile = this.profilesRepository.create({
        ...p,
        subscriptionId: sub.id,
      } as any);
      try {
        const saved = (await this.profilesRepository.save(profile)) as unknown as Profile;
        savedProfiles.push(saved);
      } catch (err) {
        this.logger.warn(`Failed to save profile: ${err.message}`);
      }
    }

    await this.subscriptionsService.incrementServerCount(sub.id, savedProfiles.length);
    await this.subscriptionsService.updateStatus(sub.id, SubscriptionStatus.ACTIVE);

    // Get online services
    const onlineServices = await this.onlineServicesRepository.find({ where: { isEnabled: true } });

    // Scan each profile
    for (const profile of savedProfiles) {
      await this.scanProfile(profile, onlineServices, settings, timeoutMs, results);
    }
  }

  private async scanProfile(profile: Profile, onlineServices: OnlineService[], settings: any, timeoutMs: number, results: any[]): Promise<void> {
    // TCP latency
    const latency = await this.latencyService.measureLatency(profile.address, profile.port, timeoutMs);

    // DNS resolve
    let resolvedIp: string | null = null;
    try {
      const addresses = await dns.promises.resolve4(profile.address);
      resolvedIp = addresses[0] || null;
    } catch {
      try {
        const addresses = await dns.promises.resolve6(profile.address);
        resolvedIp = addresses[0] || null;
      } catch {
        resolvedIp = null;
      }
    }

    // Service reachability
    const urls = onlineServices.flatMap((s) => s.testUrls);
    const reachability = await this.reachabilityService.checkUrls(urls, timeoutMs);

    // Update profile
    profile.lastLatencyMs = latency as any;
    profile.lastReachable = latency !== null;
    profile.lastScannedAt = new Date();
    if (resolvedIp) {
      profile.rawConfig = { ...(profile.rawConfig || {}), resolvedIps: [resolvedIp] };
    }
    await this.profilesRepository.save(profile);

    // Save scan history
    for (const svc of onlineServices) {
      for (const url of svc.testUrls) {
        const entry = this.scanHistoryRepository.create({
          profileId: profile.id,
          onlineServiceId: svc.id,
          latencyMs: latency ?? undefined,
          reachable: reachability[url] ?? false,
          resolvedIp: resolvedIp ?? undefined,
        });
        await this.scanHistoryRepository.save(entry);
      }
    }

    // Anycast score
    const sampleCount = (await this.scanHistoryRepository.count({ where: { profileId: profile.id, resolvedIp: resolvedIp || undefined } })) || 0;
    const score = await this.anycastService.computeAnycastScore(profile.id, resolvedIp || '');
    if (score !== null) {
      profile.anycastScore = score;
      profile.anycastSamples = sampleCount;
      await this.profilesRepository.save(profile);
      await this.anycastService.updateAnycastScore(profile.id, resolvedIp || '', score, sampleCount);
    }

    results.push({ profileId: profile.id, latency, reachable: latency !== null, resolvedIp });
  }
}