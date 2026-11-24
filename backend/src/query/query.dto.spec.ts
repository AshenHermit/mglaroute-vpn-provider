import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { QueryServersDto } from './query.dto';

describe('QueryServersDto boolean filters', () => {
  it('keeps true and false intact with global implicit conversion enabled', () => {
    const dto = plainToInstance(
      QueryServersDto,
      { reachable: 'true', anycast: 'false' },
      { enableImplicitConversion: true },
    );
    expect(dto.reachable).toBe(true);
    expect(dto.anycast).toBe(false);
  });
});
