import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_SERVICE } from './cache.interface';
import { RedisCacheService } from './redis-cache.service';
import { NoopCacheService } from './noop-cache.service';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_SERVICE,
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string | undefined>('redisUrl');
        return redisUrl ? new RedisCacheService(redisUrl) : new NoopCacheService();
      },
      inject: [ConfigService],
    },
  ],
  exports: [CACHE_SERVICE],
})
export class CacheModule {}
