import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './adapters/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const redisAdapter = new RedisIoAdapter(
    app,
    config.get<string>('REDIS_HOST', '127.0.0.1'),
    config.get<number>('REDIS_PORT', 6379),
    config.get<string>('REDIS_PASSWORD'),
  );
  await redisAdapter.connectToRedis();
  app.useWebSocketAdapter(redisAdapter);

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  Logger.log(`WebSocket Gateway sluša na portu ${port}`, 'Bootstrap');
}

bootstrap();
