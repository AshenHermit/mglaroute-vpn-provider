import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSettingsDto } from './dto/update-settings.dto';

describe('UpdateSettingsDto', () => {
  it('accepts canonical settings keys', async () => {
    const dto = plainToInstance(UpdateSettingsDto, { intervalSeconds: 600, enabled: true });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects frontend-only keys under whitelist validation', async () => {
    const dto = plainToInstance(UpdateSettingsDto, { scanIntervalMinutes: 5 } as any);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some((error) => error.property === 'scanIntervalMinutes')).toBe(true);
  });
});
