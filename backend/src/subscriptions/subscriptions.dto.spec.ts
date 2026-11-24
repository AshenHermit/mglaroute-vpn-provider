import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

describe('CreateSubscriptionDto', () => {
  it('accepts enabled and autoUpdateIntervalMinutes', async () => {
    const dto = plainToInstance(CreateSubscriptionDto, {
      name: 'test',
      url: 'https://example.com/sub.txt',
      enabled: false,
      autoUpdateIntervalMinutes: 60,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects invalid enabled and negative autoUpdateIntervalMinutes', async () => {
    const dto = plainToInstance(CreateSubscriptionDto, {
      name: 'test',
      url: 'https://example.com/sub.txt',
      enabled: 'yes',
      autoUpdateIntervalMinutes: -1,
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['enabled', 'autoUpdateIntervalMinutes']),
    );
  });
});
