import { DataSource } from 'typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: ['.env.local', '.env'],
});

const configService = new ConfigService();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.get('DB_HOST', 'localhost'),
  port: configService.get('DB_PORT', 5432),
  username: configService.get('DB_USER', 'mglaroute'),
  password: configService.get('DB_PASSWORD', 'mglaroute'),
  database: configService.get('DB_NAME', 'mglaroute'),
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: configService.get('DB_LOGGING', 'false') === 'true',
  ssl: configService.get('DB_SSL', 'false') === 'true',
});