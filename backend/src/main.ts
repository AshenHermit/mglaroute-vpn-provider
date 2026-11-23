import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvelopeExceptionFilter } from './common/filters/envelope-exception.filter';
import { FirstRunGuard } from './common/guards/first-run.guard';
import { Reflector } from '@nestjs/core';
import { FirstRunService } from './auth/first-run.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.enableCors({
    origin: [frontendUrl, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
    credentials: true,
  });
  app.useGlobalFilters(new EnvelopeExceptionFilter());
  const reflector = app.get(Reflector);
  const firstRunService = app.get(FirstRunService);
  app.useGlobalGuards(new FirstRunGuard(reflector, firstRunService));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('mglaroute VPN Server API')
    .setDescription('VPN Server Management API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📚 API docs available at http://localhost:${port}/api/docs`);
}

bootstrap();