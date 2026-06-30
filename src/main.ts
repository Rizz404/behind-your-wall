import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: true,
    allowedHeaders: ['Content-Type', 'X-Site-Key', 'Authorization'],
  });

  app.useStaticAssets(join(__dirname, '..', '..', 'sdk'), { prefix: '/sdk/' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3100;
  await app.listen(port);
  Logger.log(`Tracker API listening on port ${port}`, 'Bootstrap');
}

bootstrap();
