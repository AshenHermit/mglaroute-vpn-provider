import { QueryService } from './query.service';

function qbMock() {
  const qb: any = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  return qb;
}

function makeService(qb: any) {
  const profileRepository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  const settingsRepository = { findOne: jest.fn().mockResolvedValue({ anycastThreshold: 0.5 }) };
  return new QueryService(profileRepository as any, {} as any, settingsRepository as any);
}

describe('QueryService.queryServers', () => {
  it('hides stale profiles and searches remarks, name and address', async () => {
    const qb = qbMock();
    const service = makeService(qb);

    await service.queryServers({ search: 'alpha' });

    const clauses = qb.andWhere.mock.calls.map((call: any[]) => String(call[0]));
    expect(clauses.some((c: string) => c.includes('present'))).toBe(true);
    expect(clauses.some((c: string) => c.includes('remarks'))).toBe(true);
    expect(clauses.some((c: string) => c.includes('name'))).toBe(true);
    expect(clauses.some((c: string) => c.includes('address'))).toBe(true);
  });

  it('returns remarks in the server list', async () => {
    const qb = qbMock();
    qb.getManyAndCount.mockResolvedValue([[
      {
        id: 'p-1', address: 'example.com', port: 443, protocol: 'vless',
        name: 'example.com:443', remarks: 'Alpha', lastLatencyMs: 12, lastReachable: true,
        anycastScore: null, anycastSamples: 0, lastScannedAt: new Date(),
      },
    ], 1]);
    const service = makeService(qb);

    const result = await service.queryServers({});

    expect(result.servers[0].remarks).toBe('Alpha');
  });

  it('maps stored service ids and check time to server rows', async () => {
    const qb = qbMock();
    const checkedAt = new Date('2026-11-24T10:00:00.000Z');
    qb.getManyAndCount.mockResolvedValue([[
      {
        id: 'p-1', address: 'example.com', port: 443, protocol: 'vless',
        name: 'example.com:443', remarks: null, lastLatencyMs: 12, lastReachable: true,
        anycastScore: null, anycastSamples: 0, lastScannedAt: new Date(),
        serviceIds: ['svc-1', 'svc-2'], servicesCheckedAt: checkedAt,
      },
    ], 1]);
    const service = makeService(qb);

    const result = await service.queryServers({});

    expect(result.servers[0].services).toEqual(['svc-1', 'svc-2']);
    expect(result.servers[0].servicesCheckedAt).toBe(checkedAt.toISOString());
  });

  it('maps absent service ids to an empty list', async () => {
    const qb = qbMock();
    qb.getManyAndCount.mockResolvedValue([[
      {
        id: 'p-1', address: 'example.com', port: 443, protocol: 'vless',
        name: 'example.com:443', remarks: null, lastLatencyMs: 12, lastReachable: true,
        anycastScore: null, anycastSamples: 0, lastScannedAt: new Date(),
      },
    ], 1]);
    const service = makeService(qb);

    const result = await service.queryServers({});

    expect(result.servers[0].services).toEqual([]);
    expect(result.servers[0].servicesCheckedAt).toBeNull();
  });

  it('filters by jsonb containment when services are requested', async () => {
    const qb = qbMock();
    const service = makeService(qb);

    await service.queryServers({ services: ['svc-1', 'svc-2'] });

    const call = qb.andWhere.mock.calls.find((args: any[]) =>
      String(args[0]).includes('profile.serviceIds'));
    expect(call).toBeDefined();
    expect(String(call[0])).toContain('@>');
    expect(call[1]).toEqual({ serviceIds: JSON.stringify(['svc-1', 'svc-2']) });
  });
});
