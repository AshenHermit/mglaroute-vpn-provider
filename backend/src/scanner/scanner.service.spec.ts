import * as axiosModule from 'axios';
import * as dns from 'dns';
import { Protocol } from '../profiles/profile.entity';
import { SubscriptionStatus } from '../subscriptions/subscription.entity';
import { AnycastService } from './anycast.service';
import { computeServicesFingerprint } from './service-fingerprint';
import { ScannerService } from './scanner.service';

const SUB_ID = 'sub-1';
const PROXY = { protocol: 'http', host: '127.0.0.1', port: 1080 } as const;

function fixture(overrides: Record<string, any> = {}) {
  return {
    id: 'p-1',
    subscriptionId: SUB_ID,
    serverId: 'server-1',
    name: 'address:port',
    remarks: 'My Remark',
    protocol: Protocol.VLESS,
    address: 'example.com',
    port: 443,
    uuid: 'uuid-1',
    password: null,
    alterId: null,
    security: 'none',
    network: 'tcp',
    path: '',
    host: '',
    tls: '',
    sni: '',
    alpn: '',
    fingerprint: '',
    flow: '',
    rawConfig: {},
    lastLatencyMs: null,
    lastReachable: null,
    anycastScore: null,
    anycastSamples: 0,
    anycastWindow: [],
    present: true,
    lastScannedAt: null,
    serviceIds: [],
    servicesCheckedAt: null,
    servicesFingerprint: null,
    ...overrides,
  } as any;
}

function subscription(overrides: Record<string, any> = {}) {
  return {
    id: SUB_ID,
    name: 'Test sub',
    url: 'https://sub.test/list',
    status: SubscriptionStatus.ACTIVE,
    enabled: true,
    autoUpdateIntervalMinutes: 60,
    lastFetchedAt: new Date(0),
    serverCount: 0,
    ...overrides,
  } as any;
}

function onlineService(id: string, testUrls: string[]) {
  return { id, name: id, isEnabled: true, testUrls } as any;
}

function fingerprintOf(services: Array<{ id: string; testUrls: string[] }>) {
  return computeServicesFingerprint(services);
}

type Harness = {
  service: ScannerService;
  subscriptionsRepo: any;
  profilesRepo: any;
  onlineRepo: any;
  historyRepo: any;
  parser: any;
  latency: any;
  anycast: any;
  subscriptionsService: any;
  settingsService: any;
  xrayDelay: any;
  serviceCheck: any;
  getSpy: jest.SpyInstance;
};

function harness(parsed: any[] = [fixture()], anycastOverride?: any): Harness {
  const subscriptionsRepo = { find: jest.fn().mockResolvedValue([subscription()]) };
  const profilesRepo = {
    create: jest.fn((value: any) => ({ ...value })),
    save: jest.fn(async (value: any) => value),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const onlineRepo = { find: jest.fn().mockResolvedValue([]) };
  const historyRepo = {
    create: jest.fn((value: any) => value),
    save: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
  };
  const parser = { parseSubscriptionText: jest.fn().mockReturnValue({ profiles: parsed, skipped: 0 }) };
  const latency = { measureLatency: jest.fn().mockResolvedValue(55) };
  const anycast = anycastOverride ?? {
    applyScore: jest.fn((p: any, observation: any) => {
      if (observation && observation.fingerprint !== p.servicesFingerprint) {
        p.servicesFingerprint = observation.fingerprint;
      }
      p.anycastScore = 0;
      p.anycastSamples = 0;
      return 0;
    }),
    updateAnycastScore: jest.fn().mockResolvedValue(undefined),
  };
  const subscriptionsService = {
    updateStatus: jest.fn().mockResolvedValue(undefined),
    incrementServerCount: jest.fn().mockResolvedValue(undefined),
    setServerCount: jest.fn().mockResolvedValue(undefined),
    markFetchError: jest.fn().mockResolvedValue(undefined),
  };
  const settingsService = {
    getSettings: jest.fn().mockResolvedValue({
      concurrency: 2,
      timeoutMs: 1000,
      intervalSeconds: 300,
      serviceCheckExpirationSeconds: 3600,
    }),
  };
  const serviceCheck = { check: jest.fn().mockResolvedValue(new Set<string>()) };
  const xrayDelay = {
    withProxy: jest.fn(async (_profile: any, _timeout: number, callback: any) => callback(PROXY)),
    probeDelay: jest.fn().mockResolvedValue(42),
    isAvailable: jest.fn().mockReturnValue(true),
  };
  const getSpy = jest.spyOn(axiosModule.default, 'get').mockResolvedValue({
    status: 200,
    data: 'vless://uuid@example.com:443#Remark',
  });
  jest.spyOn(dns.promises, 'resolve4').mockRejectedValue(new Error('ENOTFOUND'));
  jest.spyOn(dns.promises, 'resolve6').mockRejectedValue(new Error('ENOTFOUND'));

  const service = new ScannerService(
    subscriptionsRepo as any,
    profilesRepo as any,
    onlineRepo as any,
    historyRepo as any,
    parser as any,
    latency as any,
    serviceCheck as any,
    anycast as any,
    subscriptionsService as any,
    {} as any,
    settingsService as any,
    xrayDelay as any,
  );

  return {
    service, subscriptionsRepo, profilesRepo, onlineRepo, historyRepo, parser, latency,
    anycast, subscriptionsService, settingsService, xrayDelay, serviceCheck, getSpy,
  };
}

function storedProfile(h: Harness) {
  return h.profilesRepo.save.mock.calls.map((call: any[]) => call[0]).find((p: any) => p.id === 'p-1');
}

describe('ScannerService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses proxy:false only for the subscription fetch', async () => {
    const h = harness();
    h.onlineRepo.find.mockResolvedValue([onlineService('svc-1', ['https://check.test/'])]);

    await h.service.runScan();

    expect(h.getSpy).toHaveBeenCalledTimes(1);
    for (const [url, config] of h.getSpy.mock.calls) {
      expect(config).toMatchObject({ proxy: false });
      expect(url).toBe('https://sub.test/list');
    }
  });

  it('uses an IP literal directly for anycast and never passes an empty inet', async () => {
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([fixture({ address: '144.31.225.5', serverId: 'literal-1' })]);

    await h.service.runScan();

    expect(h.anycast.applyScore).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p-1' }),
      expect.objectContaining({ reachableCount: 0, expectedCount: 0 }),
    );
    expect(h.anycast.updateAnycastScore).toHaveBeenCalledWith('p-1', '144.31.225.5', 0, 0);
    expect(h.anycast.updateAnycastScore.mock.calls.every((call: any[]) => call[1] !== '')).toBe(true);
    expect(h.service.getStatus().lastScanResult.profilesScanned).toBe(1);
  });

  it('passes fresh service check counts as an observation', async () => {
    const services = [
      onlineService('svc-1', ['https://a.test/']),
      onlineService('svc-2', ['https://b.test/']),
    ];
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([fixture()]);
    h.onlineRepo.find.mockResolvedValue(services);
    h.serviceCheck.check.mockResolvedValue(new Set(['https://a.test/']));

    await h.service.runScan();

    expect(h.anycast.applyScore).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p-1' }),
      { fingerprint: fingerprintOf(services), reachableCount: 1, expectedCount: 2 },
    );
  });

  it('does not record an observation when the service check is cached', async () => {
    const services = [onlineService('svc-1', ['https://a.test/'])];
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([
      fixture({
        address: '1.2.3.4',
        servicesCheckedAt: new Date(),
        servicesFingerprint: fingerprintOf(services),
        serviceIds: ['svc-1'],
      }),
    ]);
    h.onlineRepo.find.mockResolvedValue(services);

    await h.service.runScan();

    expect(h.anycast.applyScore).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }), null);
    expect(h.serviceCheck.check).not.toHaveBeenCalled();
  });

  it('resets the anycast window when service settings change', async () => {
    const oldServices = [onlineService('svc-1', ['https://old.test/'])];
    const newServices = [onlineService('svc-1', ['https://new.test/'])];
    const scoreRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: any) => ({ ...v })),
      save: jest.fn(async (v: any) => v),
    };
    const h = harness([], new AnycastService(scoreRepo as any));
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([
      fixture({
        address: '1.2.3.4',
        servicesCheckedAt: new Date(),
        servicesFingerprint: fingerprintOf(oldServices),
        serviceIds: ['svc-1'],
        anycastWindow: [true, true, true],
        anycastScore: 1,
        anycastSamples: 3,
      }),
    ]);
    h.onlineRepo.find.mockResolvedValue(newServices);
    h.serviceCheck.check.mockResolvedValue(new Set(['https://new.test/']));

    await h.service.runScan();

    const saved = storedProfile(h);
    expect(saved.servicesFingerprint).toBe(fingerprintOf(newServices));
    expect(saved.anycastWindow).toEqual([false]);
    expect(saved.anycastScore).toBe(0);
    expect(saved.anycastSamples).toBe(1);
    expect(scoreRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'p-1',
      resolvedIp: '1.2.3.4',
      score: 0,
      sampleCount: 1,
    }));
  });

  it('continues with the next profile after one profile throws', async () => {
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([
      fixture({ id: 'p-1', serverId: 'server-1' }),
      fixture({ id: 'p-2', serverId: 'server-2', address: 'two.example.com' }),
    ]);
    h.xrayDelay.withProxy.mockRejectedValueOnce(new Error('probe crashed'));

    await h.service.runScan();

    expect(h.xrayDelay.withProxy).toHaveBeenCalledTimes(2);
    expect(h.service.getStatus().lastScanResult.failed).toBeGreaterThanOrEqual(1);
    expect(h.service.getStatus().lastScanResult.succeeded).toBeGreaterThanOrEqual(1);
  });

  it('upserts parsed profiles on re-scan instead of inserting duplicates', async () => {
    const h = harness();
    const saved = new Map<string, any>();
    h.profilesRepo.findOne.mockImplementation(({ where }: any) => Promise.resolve(saved.get(where.serverId) || null));
    h.profilesRepo.save.mockImplementation(async (value: any) => {
      if (!value.id) value.id = `generated-${value.serverId}`;
      saved.set(value.serverId, value);
      return value;
    });

    await h.service.runScan();
    await h.service.runScan();

    expect(h.profilesRepo.create).toHaveBeenCalledTimes(1);
    expect(h.profilesRepo.save).toHaveBeenCalledTimes(4);
    expect(h.subscriptionsService.setServerCount).toHaveBeenCalledWith(SUB_ID, 1);
  });

  it('scans stored profiles and records lastError when fetch fails', async () => {
    const h = harness();
    h.getSpy.mockRejectedValueOnce(new Error('network down'));
    h.profilesRepo.find.mockResolvedValue([fixture()]);

    await h.service.runScan();

    expect(h.xrayDelay.withProxy).toHaveBeenCalled();
    expect(h.subscriptionsService.markFetchError).toHaveBeenCalledWith(SUB_ID, 'network down');
  });

  it('does not substitute TCP latency when a real-delay probe fails', async () => {
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([fixture()]);
    h.xrayDelay.probeDelay.mockResolvedValue(null);

    await h.service.runScan();

    expect(h.latency.measureLatency).not.toHaveBeenCalled();
    expect(h.serviceCheck.check).not.toHaveBeenCalled();
    expect(h.service.getStatus().lastScanResult.details.some((d: any) => d.latency === null)).toBe(true);
  });

  it('falls back to TCP latency when the xray binary is missing', async () => {
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([fixture()]);
    h.xrayDelay.isAvailable.mockReturnValue(false);

    await h.service.runScan();

    expect(h.xrayDelay.withProxy).not.toHaveBeenCalled();
    expect(h.latency.measureLatency).toHaveBeenCalledWith('example.com', 443, 1000);
  });

  it('does not refresh a subscription whose autoUpdateIntervalMinutes is 0', async () => {
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([fixture()]);
    h.getSpy.mockClear();

    await h.service.runScan();

    expect(h.parser.parseSubscriptionText).not.toHaveBeenCalled();
    expect(h.profilesRepo.find).toHaveBeenCalledWith({
      where: { subscriptionId: SUB_ID, present: true },
    });
  });

  it('skips the service check and keeps the stored list when the delay probe fails', async () => {
    const h = harness();
    const storedCheckedAt = new Date('2026-01-01T00:00:00Z');
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([
      fixture({ address: '1.2.3.4', servicesCheckedAt: storedCheckedAt, servicesFingerprint: 'old', serviceIds: ['svc-old'] }),
    ]);
    h.onlineRepo.find.mockResolvedValue([onlineService('svc-1', ['https://a.test/'])]);
    h.xrayDelay.probeDelay.mockResolvedValue(null);

    await h.service.runScan();

    expect(h.serviceCheck.check).not.toHaveBeenCalled();
    expect(storedProfile(h).servicesCheckedAt).toEqual(storedCheckedAt);
    expect(storedProfile(h).serviceIds).toEqual(['svc-old']);
    expect(h.historyRepo.save).toHaveBeenCalled();
  });

  it('does not re-check a profile stamped with the current fingerprint', async () => {
    const h = harness();
    const services = [onlineService('svc-1', ['https://a.test/'])];
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([
      fixture({
        address: '1.2.3.4',
        servicesCheckedAt: new Date(),
        servicesFingerprint: fingerprintOf(services),
        serviceIds: ['svc-1'],
      }),
    ]);
    h.onlineRepo.find.mockResolvedValue(services);

    await h.service.runScan();

    expect(h.serviceCheck.check).not.toHaveBeenCalled();
    expect(h.historyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ reachable: true }));
  });

  it('re-checks when the timestamp is missing', async () => {
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([fixture({ servicesCheckedAt: null })]);
    h.onlineRepo.find.mockResolvedValue([onlineService('svc-1', ['https://a.test/'])]);

    await h.service.runScan();

    expect(h.serviceCheck.check).toHaveBeenCalledWith(['https://a.test/'], PROXY, 1000);
  });

  it('re-checks when a service URL changed', async () => {
    const h = harness();
    const oldFingerprint = fingerprintOf([{ id: 'svc-1', testUrls: ['https://old.test/'] }]);
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([
      fixture({ servicesCheckedAt: new Date(), servicesFingerprint: oldFingerprint }),
    ]);
    h.onlineRepo.find.mockResolvedValue([onlineService('svc-1', ['https://new.test/'])]);

    await h.service.runScan();

    expect(h.serviceCheck.check).toHaveBeenCalledWith(['https://new.test/'], PROXY, 1000);
  });

  it('stores only fully reachable IDs, maps shared URLs to all services and skips empty services', async () => {
    const h = harness();
    const services = [
      onlineService('svc-1', ['https://a.test/', 'https://b.test/']),
      onlineService('svc-2', ['https://c.test/']),
      onlineService('svc-3', []),
      onlineService('svc-4', ['https://c.test/']),
    ];
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([fixture()]);
    h.onlineRepo.find.mockResolvedValue(services);
    h.serviceCheck.check.mockResolvedValue(new Set(['https://a.test/', 'https://c.test/']));

    await h.service.runScan();

    const saved = storedProfile(h);
    expect([...saved.serviceIds].sort()).toEqual(['svc-2', 'svc-4']);
    expect(saved.servicesCheckedAt).toBeInstanceOf(Date);
    expect(saved.servicesFingerprint).toBe(fingerprintOf(services));
    expect(h.serviceCheck.check.mock.calls[0][1]).toEqual(PROXY);
    expect(h.serviceCheck.check.mock.calls[0][1]).not.toHaveProperty('proxy', false);
  });
});
