import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { CacheService, SetOptions } from './cache.interface';

@Injectable()
export class RedisCacheService implements CacheService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: RedisClientType;

  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl });
    this.client.on('error', (err) => this.logger.error(`Redis client error: ${err.message}`));
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  isEnabled(): boolean {
    return true;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.warn(`get(${key}) failed, treating as cache miss: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: string, options?: SetOptions): Promise<void> {
    try {
      if (options?.ttlSeconds) {
        await this.client.set(key, value, { EX: options.ttlSeconds });
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.logger.warn(`set(${key}) failed: ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(`del(${key}) failed: ${(err as Error).message}`);
    }
  }

  getRawClient(): RedisClientType {
    return this.client;
  }
}
