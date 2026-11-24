import * as axiosModule from 'axios';
import * as dns from 'dns';
import { Protocol } from '../profiles/profile.entity';
import { SubscriptionStatus } from '../subscriptions/subscription.entity';
import { ReachabilityService } from './reachability.service';
import { ScannerService } from './scanner.service';

const SUB_ID = 'sub-1';

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
    present: true,
    lastScannedAt: null,
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
  getSpy: jest.SpyInstance;
};

function harness(parsed: any[] = [fixture()]): Harness {
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
  const anycast = {
    computeAnycastScore: jest.fn().mockResolvedValue(null),
    updateAnycastScore: jest.fn().mockResolvedValue(undefined),
  };
  const subscriptionsService = {
    updateStatus: jest.fn().mockResolvedValue(undefined),
    incrementServerCount: jest.fn().mockResolvedValue(undefined),
    setServerCount: jest.fn().mockResolvedValue(undefined),
    markFetchError: jest.fn().mockResolvedValue(undefined),
  };
  const settingsService = {
    getSettings: jest.fn().mockResolvedValue({ concurrency: 2, timeoutMs: 1000, intervalSeconds: 300 }),
  };
  const xrayDelay = {
    measureDelay: jest.fn().mockResolvedValue(42),
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
    new ReachabilityService(),
    anycast as any,
    subscriptionsService as any,
    {} as any,
    settingsService as any,
    xrayDelay as any,
  );

  return {
    service, subscriptionsRepo, profilesRepo, onlineRepo, historyRepo, parser, latency,
    anycast, subscriptionsService, settingsService, xrayDelay, getSpy,
  };
}

describe('ScannerService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses proxy:false for subscription fetch and reachability requests', async () => {
    const h = harness();
    h.onlineRepo.find.mockResolvedValue([{ id: 'svc-1', isEnabled: true, testUrls: ['https://check.test/'] }]);

    await h.service.runScan();

    expect(h.getSpy).toHaveBeenCalled();
    for (const [url, config] of h.getSpy.mock.calls) {
      expect(config).toMatchObject({ proxy: false });
      expect(url).toBeTruthy();
    }
  });

  it('uses an IP literal directly for anycast and never passes an empty inet', async () => {
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([fixture({ address: '144.31.225.5', serverId: 'literal-1' })]);

    await h.service.runScan();

    expect(h.anycast.computeAnycastScore).toHaveBeenCalledWith(expect.any(String), '144.31.225.5');
    expect(h.anycast.computeAnycastScore.mock.calls.every((call: any[]) => call[1] !== '')).toBe(true);
    expect(h.service.getStatus().lastScanResult.profilesScanned).toBe(1);
  });

  it('continues with the next profile after one profile throws', async () => {
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([
      fixture({ id: 'p-1', serverId: 'server-1' }),
      fixture({ id: 'p-2', serverId: 'server-2', address: 'two.example.com' }),
    ]);
    h.xrayDelay.measureDelay
      .mockRejectedValueOnce(new Error('probe crashed'))
      .mockResolvedValueOnce(77);

    await h.service.runScan();

    expect(h.xrayDelay.measureDelay).toHaveBeenCalledTimes(2);
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

    expect(h.xrayDelay.measureDelay).toHaveBeenCalled();
    expect(h.subscriptionsService.markFetchError).toHaveBeenCalledWith(SUB_ID, 'network down');
  });

  it('does not substitute TCP latency when a real-delay probe fails', async () => {
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([fixture()]);
    h.xrayDelay.measureDelay.mockResolvedValue(null);

    await h.service.runScan();

    expect(h.latency.measureLatency).not.toHaveBeenCalled();
    expect(h.service.getStatus().lastScanResult.details.some((d: any) => d.latency === null)).toBe(true);
  });

  it('falls back to TCP latency when the xray binary is missing', async () => {
    const h = harness();
    h.subscriptionsRepo.find.mockResolvedValue([subscription({ autoUpdateIntervalMinutes: 0 })]);
    h.profilesRepo.find.mockResolvedValue([fixture()]);
    h.xrayDelay.isAvailable.mockReturnValue(false);

    await h.service.runScan();

    expect(h.xrayDelay.measureDelay).not.toHaveBeenCalled();
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
});
