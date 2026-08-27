import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Globalni Redis provider - jedan konekcioni pool dijele TableSessionService
 * (za stanje sesija/korpi) i RedisIoAdapter (za Socket.io pub/sub izmedju
 * vise instanci servera kad se skalira horizontalno).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis({
          host: config.get<string>('REDIS_HOST', '127.0.0.1'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          // Upstash i vecina managed Redis servisa zahtijevaju TLS (self-hosted/Docker Redis ne) - ukljuci preko REDIS_TLS=true u .env, ne mijenjati kod po okruzenju.
          tls: config.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
          maxRetriesPerRequest: 3,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
