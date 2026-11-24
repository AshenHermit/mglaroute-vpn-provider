import axios from 'axios';
import { ServiceCheckService } from './service-check.service';

const proxy = { protocol: 'http', host: '127.0.0.1', port: 1080 } as const;

describe('ServiceCheckService', () => {
  let service: ServiceCheckService;
  let getSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new ServiceCheckService();
    getSpy = jest.spyOn(axios, 'get');
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps only URLs whose response status is 2xx', async () => {
    getSpy.mockImplementation((url: string) => {
      const statuses: Record<string, number> = {
        'https://ok.test': 200,
        'https://no-content.test': 204,
        'https://forbidden.test': 403,
        'https://missing.test': 404,
        'https://broken.test': 500,
      };
      if (url === 'https://network-error.test') return Promise.reject(new Error('ECONNRESET'));
      return Promise.resolve({ status: statuses[url], data: '' });
    });

    const result = await service.check(
      [
        'https://ok.test',
        'https://no-content.test',
        'https://forbidden.test',
        'https://missing.test',
        'https://broken.test',
        'https://network-error.test',
      ],
      proxy,
      1000,
    );

    expect([...result].sort()).toEqual(['https://no-content.test', 'https://ok.test']);
  });

  it('sends every request through the supplied proxy with status inspection enabled', async () => {
    getSpy.mockResolvedValue({ status: 200, data: '' });

    await service.check(['https://a.test', 'https://b.test'], proxy, 2500);

    expect(getSpy).toHaveBeenCalledTimes(2);
    for (const [, config] of getSpy.mock.calls) {
      expect(config.proxy).toBe(proxy);
      expect(config.timeout).toBe(2500);
      expect(typeof config.validateStatus).toBe('function');
      expect(config.validateStatus(403)).toBe(true);
    }
  });

  it('makes no requests for an empty URL list', async () => {
    const result = await service.check([], proxy, 1000);

    expect(result.size).toBe(0);
    expect(getSpy).not.toHaveBeenCalled();
  });
});
