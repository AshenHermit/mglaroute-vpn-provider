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

describe('QueryService.queryServers', () => {
  it('hides stale profiles and searches remarks, name and address', async () => {
    const qb = qbMock();
    const profileRepository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const settingsRepository = { findOne: jest.fn().mockResolvedValue({ anycastThreshold: 0.5 }) };
    const service = new QueryService(profileRepository as any, {} as any, settingsRepository as any);

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
    const profileRepository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const settingsRepository = { findOne: jest.fn().mockResolvedValue({ anycastThreshold: 0.5 }) };
    const service = new QueryService(profileRepository as any, {} as any, settingsRepository as any);

    const result = await service.queryServers({});

    expect(result.servers[0].remarks).toBe('Alpha');
  });
});
