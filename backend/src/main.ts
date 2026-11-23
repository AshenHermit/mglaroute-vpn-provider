import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvelopeExceptionFilter } from './common/filters/envelope-exception.filter';
import { FirstRunGuard } from './common/guards/first-run.guard';
import { Reflector } from '@nestjs/core';
import { FirstRunService } from './auth/first-run.service';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new EnvelopeExceptionFilter());
  const reflector = app.get(Reflector);
  const firstRunService = app.get(FirstRunService);
  app.useGlobalGuards(new FirstRunGuard(reflector, firstRunService));

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin === frontendUrl) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

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