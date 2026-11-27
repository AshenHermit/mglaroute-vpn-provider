import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { FeedController } from './feed.controller';

describe('FeedController.getServices', () => {
  it('returns the curated array as raw JSON and stays public', async () => {
    const rows = [{ id: 'svc-1', name: 'YouTube' }];
    const feedService = { listPublicServices: jest.fn().mockResolvedValue(rows) } as any;
    const json = jest.fn();
    const controller = new FeedController(feedService);

    await controller.getServices({ json } as any);

    expect(json).toHaveBeenCalledWith(rows);
    expect(new Reflector().get(IS_PUBLIC_KEY, FeedController)).toBe(true);
    expect(new Reflector().get(IS_PUBLIC_KEY, FeedController.prototype.getServices)).toBeUndefined();
  });
});
