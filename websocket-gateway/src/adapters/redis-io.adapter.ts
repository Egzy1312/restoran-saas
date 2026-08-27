import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext } from '@nestjs/common';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/**
 * Socket.io adapter podrzan Redis pub/sub-om - potreban cim se WebSocket
 * gateway skalira na vise od jedne instance servera (npr. iza load
 * balancera). Bez ovoga, `cart_updated` broadcast bi stigao samo gostima
 * povezanim na istu instancu koja je primila `add_cart_item`.
 *
 * Za MVP sa jednim serverskim procesom ovo tehnicki nije neophodno, ali je
 * jeftino ukljuciti od pocetka da se izbjegne bolan refaktor kasnije.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;

  constructor(
    app: INestApplicationContext,
    private readonly redisHost: string,
    private readonly redisPort: number,
    private readonly redisPassword?: string,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pubClient = new Redis({
      host: this.redisHost,
      port: this.redisPort,
      password: this.redisPassword || undefined,
    });
    const subClient = pubClient.duplicate();

    this.adapterConstructor = createAdapter(pubClient as any, subClient as any);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
