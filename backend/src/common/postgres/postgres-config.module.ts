import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 5432),
        username: configService.get('DB_USER', 'mglaroute'),
        password: configService.get('DB_PASSWORD', 'mglaroute'),
        database: configService.get('DB_NAME', 'mglaroute'),
        entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
        synchronize: configService.get('DB_SYNCHRONIZE', 'true') === 'true',
        logging: configService.get('DB_LOGGING', 'false') === 'true',
        ssl: configService.get('DB_SSL', 'false') === 'true',
      }),
      dataSourceFactory: async (options: any) => {
        const dataSource = new DataSource(options);
        return dataSource.initialize();
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class PostgresConfigModule {}