import * as axiosModule from 'axios';
import { SubscriptionStatus } from './subscription.entity';
import { SubscriptionsService } from './subscriptions.service';
import { Protocol } from '../profiles/profile.entity';

const ID = 'sub-1';

function harness() {
  const subscription = {
    id: ID,
    name: 'Test sub',
    url: 'https://sub.test/list',
    status: SubscriptionStatus.ACTIVE,
    enabled: true,
    autoUpdateIntervalMinutes: 0,
    lastFetchedAt: new Date(1000),
    serverCount: 0,
  };
  const subscriptionsRepo = {
    findOne: jest.fn().mockResolvedValue(subscription),
    save: jest.fn(async (value: any) => value),
    update: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn().mockResolvedValue(undefined),
  };
  const profilesRepo = {
    create: jest.fn((value: any) => ({ ...value })),
    save: jest.fn(async (value: any) => value),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
  };
  const parser = {
    parseSubscriptionText: jest.fn().mockReturnValue({
      profiles: [{
        subscriptionId: ID,
        serverId: 'server-1',
        name: 'parsed',
        remarks: 'Parsed Remark',
        protocol: Protocol.VLESS,
        address: 'example.com',
        port: 443,
        uuid: 'uuid-1',
        rawConfig: {},
      }],
      skipped: 0,
    }),
  };
  const getSpy = jest.spyOn(axiosModule.default, 'get').mockResolvedValue({
    status: 200,
    data: 'vless://uuid@example.com:443#Parsed%20Remark',
  });
  const service = new (SubscriptionsService as any)(subscriptionsRepo, profilesRepo, parser);
  return { service, subscription, subscriptionsRepo, profilesRepo, parser, getSpy };
}

describe('SubscriptionsService.fetch', () => {
  afterEach(() => jest.restoreAllMocks());

  it('downloads, parses and upserts profiles even with interval 0', async () => {
    const h = harness();

    const result = await h.service.fetch(ID);

    expect(result).toMatchObject({ ok: true, parsed: 1 });
    expect(h.getSpy).toHaveBeenCalledWith(h.subscription.url, expect.objectContaining({ proxy: false }));
    expect(h.parser.parseSubscriptionText).toHaveBeenCalled();
    expect(h.profilesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ remarks: 'Parsed Remark' }));
    expect(h.subscriptionsRepo.update).toHaveBeenCalledWith({ id: ID }, { serverCount: 1 });
  });

  it('keeps stored profiles visible when a fetched subscription is empty', async () => {
    const h = harness();
    h.getSpy.mockResolvedValueOnce({ status: 200, data: '' });
    h.parser.parseSubscriptionText.mockReturnValueOnce({ profiles: [], skipped: 0 });
    h.profilesRepo.find.mockResolvedValueOnce([{ serverId: 'server-1', present: true }]);

    const result = await h.service.fetch(ID);

    expect(result).toMatchObject({ ok: true, parsed: 0 });
    expect(h.profilesRepo.save).not.toHaveBeenCalledWith(expect.objectContaining({ present: false }));
  });

  it('keeps lastFetchedAt unchanged and records lastError when download fails', async () => {
    const h = harness();
    h.getSpy.mockRejectedValueOnce(new Error('network down'));

    const result = await h.service.fetch(ID);

    expect(result).toMatchObject({ ok: false, message: 'network down' });
    const saved = h.subscriptionsRepo.save.mock.calls.map((call: any[]) => call[0]);
    expect(saved.some((sub: any) => sub.status === SubscriptionStatus.ERROR && sub.lastError === 'network down')).toBe(true);
    expect(saved.every((sub: any) => new Date(sub.lastFetchedAt).getTime() === 1000)).toBe(true);
  });
});
