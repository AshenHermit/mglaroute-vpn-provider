import { CronService } from './cron.service';

function harness(settingsOverrides: Record<string, any> = {}) {
  const scanner = { runScan: jest.fn().mockResolvedValue(undefined) };
  const settings = {
    getSettings: jest.fn().mockResolvedValue({
      enabled: true,
      intervalSeconds: 300,
      ...settingsOverrides,
    }),
  };
  const service = new CronService(scanner as any, settings as any);
  return { service, scanner, settings };
}

describe('CronService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not scan when scanning is disabled', async () => {
    const h = harness({ enabled: false });
    (h.service as any).lastScanAt = new Date(Date.now() - 600_000);

    await h.service.handleCron();

    expect(h.scanner.runScan).not.toHaveBeenCalled();
  });

  it('scans when the interval has elapsed and computes nextScanAt', async () => {
    const h = harness();
    (h.service as any).lastScanAt = new Date(Date.now() - 301_000);

    await h.service.handleCron();

    expect(h.scanner.runScan).toHaveBeenCalledTimes(1);
    expect((h.service as any).nextScanAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not scan before the interval has elapsed', async () => {
    const h = harness();
    (h.service as any).lastScanAt = new Date(Date.now() - 60_000);

    await h.service.handleCron();

    expect(h.scanner.runScan).not.toHaveBeenCalled();
  });
});
