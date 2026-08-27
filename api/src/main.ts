import 'reflect-metadata';
import { join } from 'path';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { SentryExceptionsFilter } from './common/filters/sentry-exceptions.filter';

async function bootstrap() {
  // Sentry se inicijalizuje SAMO ako je SENTRY_DSN podesen - bez njega ovo je
  // potpun no-op (Sentry.captureException i dalje moze biti pozvan bilo gdje
  // u kodu bez greske, samo nista ne salje nikuda).
  const sentryDsn = process.env.SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0.1,
    });
    Logger.log('Sentry inicijalizovan.', 'Bootstrap');
  }

  // rawBody: true - Stripe webhook potpis se verifikuje nad SIROVIM bajtovima
  // tijela zahtjeva (req.rawBody), ne nad vec parsiranim JSON-om (vidi
  // payments.controller.ts). Ne utice na ostale rute - i dalje dobijaju
  // parsirani `req.body` kao i do sad.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  // Otpremljene slike (meni artikli, webshop proizvodi - vidi uploads/uploads.service.ts)
  // se sluze staticki OVDJE, BEZ globalnog "/api" prefiksa ispod (useStaticAssets
  // zaobilazi Nest-ov ruter) - zato UploadsService gradi apsolutan URL preko
  // API_PUBLIC_URL umjesto relativne putanje.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Globalni exception filter - prijavljuje 5xx greske Sentry-u (ako je
  // podesen) prije nego sto NestJS-ov standardni handler oblikuje odgovor.
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionsFilter(httpAdapter));

  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS', '*').split(','),
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`API sluša na portu ${port}`, 'Bootstrap');
}

bootstrap();
