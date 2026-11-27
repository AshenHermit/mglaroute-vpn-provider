import 'reflect-metadata';
import { Profile, Protocol } from '../profiles/profile.entity';
import { FeedService } from './feed.service';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p-1',
    subscriptionId: 'sub-1',
    protocol: Protocol.VLESS,
    name: 'node-1',
    remarks: 'Node 1',
    address: 'example.com',
    port: 443,
    uuid: 'uuid-1',
    password: null,
    alterId: 0,
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
    lastLatencyMs: 12,
    lastReachable: true,
    anycastScore: 0.8,
    anycastSamples: 3,
    present: true,
    lastScannedAt: new Date('2026-11-24T10:00:00.000Z'),
    serviceIds: ['svc-1'],
    servicesCheckedAt: new Date('2026-11-24T09:00:00.000Z'),
    ...overrides,
  } as unknown as Profile;
}

function setup(profiles: Profile[], scores: any[] = [], settings: any = { anycastThreshold: 0.5 }) {
  const qb: any = {
    innerJoin: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(profiles),
  };
  const profileRepository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  const anycastScoreRepository = { find: jest.fn().mockResolvedValue(scores) };
  const settingsRepository = { findOne: jest.fn().mockResolvedValue(settings) };
  const onlineServicesService = { getEnabled: jest.fn().mockResolvedValue([] as any[]) };
  const service = new FeedService(
    profileRepository as any,
    anycastScoreRepository as any,
    settingsRepository as any,
    onlineServicesService as any,
  );
  return { service, qb, profileRepository, anycastScoreRepository, settingsRepository, onlineServicesService };
}

describe('FeedService.generate — query construction', () => {
  it('joins only active enabled subscriptions and present profiles', async () => {
    const { service, qb } = setup([]);
    await service.generate({ limit: 10 });

    expect(qb.innerJoin).toHaveBeenCalledWith('profile.subscription', 'subscription');
    const clauses = qb.andWhere.mock.calls.map((args: any[]) => String(args[0]));
    expect(clauses).toContain('profile.present = :present');
    expect(clauses).toContain('subscription.status = :status');
    expect(clauses).toContain('subscription.enabled = :enabled');
  });

  it('takes the requested limit without pagination', async () => {
    const { service, qb } = setup([]);
    await service.generate({ limit: 10 });
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(qb.skip).toBeUndefined();
  });

  it('uses the default limit 200 and configured anycast threshold', async () => {
    const { service, qb } = setup([], [], { anycastThreshold: 0.7 });
    await service.generate({ anycast: true });
    expect(qb.take).toHaveBeenCalledWith(200);
    expect(qb.andWhere).toHaveBeenCalledWith('profile.anycastScore >= :threshold', { threshold: 0.7 });
  });

  it('falls back to threshold 0.5 when settings are missing', async () => {
    const { service, qb } = setup([], [], null);
    await service.generate({ anycast: false });
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(profile.anycastScore < :threshold OR profile.anycastScore IS NULL)',
      { threshold: 0.5 },
    );
  });
});

describe('FeedService.generate — subscription format', () => {
  it('joins raw links with a trailing newline', async () => {
    const { service } = setup([
      profile({ uuid: 'a', address: 'a.example' }),
      profile({ id: 'p-2', uuid: 'b', address: 'b.example' }),
    ]);
    const result = await service.generate({ format: 'subscription' });
    expect(result.contentType).toBe('text/plain; charset=utf-8');
    const lines = result.body.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('');
    expect(lines[0]).toContain('vless://a@a.example:443');
    expect(lines[1]).toContain('vless://b@b.example:443');
  });

  it('returns an empty body when nothing matched', async () => {
    const { service } = setup([]);
    const result = await service.generate({ format: 'subscription' });
    expect(result.body).toBe('');
  });

  it('returns links without profile data leaks in subscription format', async () => {
    const { service } = setup([profile()]);
    const result = await service.generate({ format: 'subscription' });
    expect(result.body).not.toContain('svc-1');
    expect(result.body).not.toContain('1.2.3.4');
  });
});

describe('FeedService.generate — json format', () => {
  it('reports scan details, newest resolvedIp and dedupe/skipped counts', async () => {
    const { service } = setup([
      profile(),
      profile({ id: 'p-2' }),
      profile({ id: 'p-3', uuid: undefined }),
    ], [
      { profileId: 'p-1', resolvedIp: '1.2.3.4', lastUpdated: new Date('2026-11-20T00:00:00Z') },
      { profileId: 'p-1', resolvedIp: '5.6.7.8', lastUpdated: new Date('2026-11-24T00:00:00Z') },
    ]);

    const result = await service.generate({ format: 'json' });
    expect(result.contentType).toBe('application/json');
    const body = JSON.parse(result.body);
    expect(body.count).toBe(1);
    expect(body.skipped).toBe(2);
    expect(typeof body.generatedAt).toBe('string');
    expect(body.servers).toHaveLength(1);
    expect(body.servers[0]).toMatchObject({
      id: 'p-1',
      name: 'node-1',
      remarks: 'Node 1',
      protocol: 'vless',
      address: 'example.com',
      port: 443,
      latencyMs: 12,
      reachable: true,
      anycastConfidence: 0.8,
      anycastSamples: 3,
      resolvedIp: '5.6.7.8',
      lastScannedAt: '2026-11-24T10:00:00.000Z',
      services: ['svc-1'],
      servicesCheckedAt: '2026-11-24T09:00:00.000Z',
    });
    expect(body.servers[0].link).toContain('vless://uuid-1@example.com:443');
  });

  it('returns null resolvedIp when no score rows exist', async () => {
    const { service } = setup([profile()], []);
    const body = JSON.parse((await service.generate({ format: 'json' })).body);
    expect(body.servers[0].resolvedIp).toBeNull();
    expect(body.skipped).toBe(0);
  });

  it('counts a null link as skipped', async () => {
    const { service } = setup([profile({ uuid: undefined })]);
    const body = JSON.parse((await service.generate({ format: 'json' })).body);
    expect(body.servers).toEqual([]);
    expect(body.count).toBe(0);
    expect(body.skipped).toBe(1);
  });
});

describe('FeedService.listPublicServices', () => {
  it('projects only id and name for enabled services', async () => {
    const { service, onlineServicesService } = setup([]);
    onlineServicesService.getEnabled.mockResolvedValue([
      { id: 'svc-1', name: 'YouTube', testUrls: ['https://secret.example'], isEnabled: true, isDefault: true },
    ]);
    await expect(service.listPublicServices()).resolves.toEqual([
      { id: 'svc-1', name: 'YouTube' },
    ]);
  });

  it('returns an empty array when no services are enabled', async () => {
    const { service } = setup([]);
    await expect(service.listPublicServices()).resolves.toEqual([]);
  });
});
