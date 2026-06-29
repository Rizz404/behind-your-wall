import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { BlockedIp } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_SERVICE, CacheService } from '../cache/cache.interface';
import { CreateBlockedIpDto } from './dto/create-blocked-ip.dto';
import { AuthenticatedAdmin } from '../common/decorators/current-admin.decorator';

function cacheKeyFor(ip: string): string {
  return `blocklist:ip:${ip}`;
}

@Injectable()
export class BlocklistService implements OnModuleInit {
  private readonly logger = new Logger(BlocklistService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_SERVICE) private readonly cache: CacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.syncCache();
  }

  /** Re-populates the cache from Postgres. No-op when the cache layer is disabled. */
  async syncCache(): Promise<void> {
    if (!this.cache.isEnabled()) return;

    const activeBlocks = await this.prisma.blockedIp.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });

    for (const block of activeBlocks) {
      await this.cache.set(cacheKeyFor(block.ip), this.serialize(block), {
        ttlSeconds: this.ttlSecondsFor(block.expiresAt),
      });
    }

    this.logger.log(`Synced ${activeBlocks.length} active block(s) to cache`);
  }

  async isBlocked(ip: string): Promise<{ blocked: boolean; reason?: string | null }> {
    const cached = await this.cache.get(cacheKeyFor(ip));
    if (cached) {
      const parsed = JSON.parse(cached) as { reason: string | null };
      return { blocked: true, reason: parsed.reason };
    }

    if (this.cache.isEnabled()) {
      // cache enabled but missed -> not blocked, cache is the source of truth for active blocks
      return { blocked: false };
    }

    const block = await this.prisma.blockedIp.findFirst({
      where: { ip, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    return block ? { blocked: true, reason: block.reason } : { blocked: false };
  }

  async findAll(): Promise<BlockedIp[]> {
    return this.prisma.blockedIp.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateBlockedIpDto, admin: AuthenticatedAdmin): Promise<BlockedIp> {
    const block = await this.prisma.blockedIp.upsert({
      where: { ip: dto.ip },
      create: {
        ip: dto.ip,
        reason: dto.reason,
        blockedBy: admin.username,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      update: {
        reason: dto.reason,
        blockedBy: admin.username,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    await this.cache.set(cacheKeyFor(block.ip), this.serialize(block), {
      ttlSeconds: this.ttlSecondsFor(block.expiresAt),
    });

    return block;
  }

  async remove(ip: string): Promise<void> {
    const block = await this.prisma.blockedIp.findUnique({ where: { ip } });
    if (!block) throw new NotFoundException('IP is not blocked');

    await this.prisma.blockedIp.delete({ where: { ip } });
    await this.cache.del(cacheKeyFor(ip));
  }

  private serialize(block: BlockedIp): string {
    return JSON.stringify({ reason: block.reason, expiresAt: block.expiresAt });
  }

  /** Returns undefined (no TTL = permanent) when there's no expiry. */
  private ttlSecondsFor(expiresAt: Date | null): number | undefined {
    if (!expiresAt) return undefined;
    return Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }
}
