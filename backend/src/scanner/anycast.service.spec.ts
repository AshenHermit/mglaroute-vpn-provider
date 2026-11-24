import { AnycastService } from './anycast.service';

function makeService() {
  const repo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => v),
  };
  // Cast: the pre-change constructor has different dependencies; we want a runtime RED.
  const service: any = new (AnycastService as any)(repo);
  return { service: service as AnycastService & any, repo };
}

function profile(overrides: Record<string, any> = {}) {
  return {
    id: 'p-1', name: 'srv', remarks: null, servicesFingerprint: null,
    anycastWindow: [], anycastSamples: 0, anycastScore: null, ...overrides,
  } as any;
}

const check = (fingerprint = 'fp', reachableCount = 1, expectedCount = 1) => ({
  fingerprint, reachableCount, expectedCount,
});

describe('AnycastService.applyScore', () => {
  it('scores one loss in four checks as 0.25', () => {
    const { service } = makeService();
    const p = profile();

    for (const observation of [check('fp', 1, 1), check('fp', 1, 1), check('fp', 1, 1), check('fp', 0, 1)]) {
      expect(service.applyScore(p, observation)).toBeDefined();
    }

    expect(p.anycastScore).toBe(0.25);
    expect(p.anycastSamples).toBe(4);
    expect(p.anycastWindow).toEqual([false, false, false, true]);
  });

  it('ignores zero expected services', () => {
    const { service } = makeService();
    const p = profile();

    service.applyScore(p, check('fp', 0, 0));

    expect(p.anycastWindow).toEqual([]);
    expect(p.anycastSamples).toBe(0);
    expect(p.anycastScore).toBe(0);
  });

  it('resets window when service fingerprint changes', () => {
    const { service } = makeService();
    const p = profile({ anycastWindow: [true, true], servicesFingerprint: 'old' });

    service.applyScore(p, check('new', 1, 1));

    expect(p.anycastWindow).toEqual([false]);
    expect(p.anycastScore).toBe(0);
  });

  it('window caps at ten and oldest entry drops', () => {
    const { service } = makeService();
    const p = profile();

    for (let i = 0; i < 10; i++) service.applyScore(p, check('fp', 0, 1));
    expect(p.anycastSamples).toBe(10);
    expect(p.anycastScore).toBe(1);

    for (let i = 0; i < 10; i++) service.applyScore(p, check('fp', 1, 1));

    expect(p.anycastSamples).toBe(10);
    expect(p.anycastScore).toBe(0);
    expect(p.anycastWindow).toEqual([false, false, false, false, false, false, false, false, false, false]);
  });

  it('clears a legacy nonzero score on clean checks', () => {
    const { service } = makeService();
    const p = profile({ anycastScore: 0.9 });

    for (let i = 0; i < 4; i++) service.applyScore(p, check('fp', 1, 1));

    expect(p.anycastScore).toBe(0);
  });

  it('regex match forces 1.0 and survives a null observation', () => {
    const { service } = makeService();
    const p = profile({ remarks: 'AUTO HK' });

    service.applyScore(p, null);

    expect(p.anycastScore).toBe(1);
    expect(p.anycastSamples).toBe(0);
    expect(p.anycastWindow).toEqual([]);
  });
});

describe('AnycastService.updateAnycastScore', () => {
  it('writes a zero score row', async () => {
    const { service, repo } = makeService();

    await service.updateAnycastScore('p-1', '1.2.3.4', 0, 4);

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'p-1',
      resolvedIp: '1.2.3.4',
      score: 0,
      sampleCount: 4,
    }));
    expect(repo.save).toHaveBeenCalled();
  });
});
