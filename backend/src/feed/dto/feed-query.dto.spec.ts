import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FeedQueryDto } from './feed-query.dto';

describe('FeedQueryDto', () => {
  it('accepts every documented parameter', async () => {
    const dto = plainToInstance(FeedQueryDto, {
      format: 'json',
      search: 'alpha',
      protocol: 'vless',
      reachable: 'true',
      anycast: 'false',
      services: 'svc-1,svc-2',
      sort: 'confidence_desc',
      limit: '25',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      format: 'json',
      search: 'alpha',
      protocol: 'vless',
      reachable: true,
      anycast: false,
      services: ['svc-1', 'svc-2'],
      sort: 'confidence_desc',
      limit: 25,
    });
  });

  it('accepts services as an array as well as a comma list', async () => {
    const dto = plainToInstance(FeedQueryDto, { services: ['svc-1', 'svc-2'] });
    expect(await validate(dto)).toEqual([]);
    expect(dto.services).toEqual(['svc-1', 'svc-2']);
  });

  it('rejects an unknown format', async () => {
    const dto = plainToInstance(FeedQueryDto, { format: 'yaml' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('rejects an out-of-range limit', async () => {
    expect((await validate(plainToInstance(FeedQueryDto, { limit: '1001' }))).length).toBeGreaterThan(0);
    expect(await validate(plainToInstance(FeedQueryDto, { limit: '1000' }))).toEqual([]);
  });

  it('rejects an unknown sort', async () => {
    expect((await validate(plainToInstance(FeedQueryDto, { sort: 'random' }))).length).toBeGreaterThan(0);
  });

  it('rejects undeclared query parameters', async () => {
    const errors = await validate(plainToInstance(FeedQueryDto, { token: 'secret' } as any), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('keeps boolean values intact with the global implicit conversion enabled', () => {
    const dto = plainToInstance(
      FeedQueryDto,
      { reachable: 'true', anycast: 'false' },
      { enableImplicitConversion: true },
    );
    expect(dto.reachable).toBe(true);
    expect(dto.anycast).toBe(false);
  });

  it('has subscription format and limit 200 by default', () => {
    const dto = plainToInstance(FeedQueryDto, {});
    expect(dto.format).toBe('subscription');
    expect(dto.limit).toBe(200);
  });
});
