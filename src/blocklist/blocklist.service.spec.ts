import { BlocklistService } from './blocklist.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.interface';

describe('BlocklistService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let cache: jest.Mocked<CacheService>;
  let service: BlocklistService;

  beforeEach(() => {
    prisma = {
      blockedIp: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;
    cache = {
      isEnabled: jest.fn().mockReturnValue(true),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    service = new BlocklistService(prisma, cache);
  });

  describe('syncCache', () => {
    it('is a no-op when the cache layer is disabled', async () => {
      cache.isEnabled.mockReturnValue(false);
      await service.syncCache();
      expect((prisma.blockedIp.findMany as jest.Mock)).not.toHaveBeenCalled();
    });

    it('writes every active block (permanent + not-yet-expired) to the cache with the right TTL', async () => {
      const now = Date.now();
      (prisma.blockedIp.findMany as jest.Mock).mockResolvedValue([
        { ip: '1.1.1.1', reason: 'permanent', expiresAt: null },
        { ip: '2.2.2.2', reason: 'temp', expiresAt: new Date(now + 60_000) },
      ]);

      await service.syncCache();

      expect(cache.set).toHaveBeenCalledTimes(2);
      expect(cache.set).toHaveBeenCalledWith(
        'blocklist:ip:1.1.1.1',
        expect.any(String),
        { ttlSeconds: undefined },
      );
      const [, , opts] = (cache.set as jest.Mock).mock.calls[1];
      expect(opts.ttlSeconds).toBeGreaterThan(0);
    });

    it('excludes already-expired blocks via the DB query filter', async () => {
      (prisma.blockedIp.findMany as jest.Mock).mockResolvedValue([]);
      await service.syncCache();
      expect(prisma.blockedIp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] },
        }),
      );
    });
  });

  describe('isBlocked', () => {
    it('returns blocked=true on a cache hit', async () => {
      cache.get.mockResolvedValue(JSON.stringify({ reason: 'abuse' }));
      await expect(service.isBlocked('1.1.1.1')).resolves.toEqual({
        blocked: true,
        reason: 'abuse',
      });
    });

    it('returns blocked=false on a cache miss when the cache is enabled (cache is the source of truth for the fast path)', async () => {
      cache.get.mockResolvedValue(null);
      await expect(service.isBlocked('1.1.1.1')).resolves.toEqual({ blocked: false });
      expect(prisma.blockedIp.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to a direct DB query when the cache is disabled', async () => {
      cache.isEnabled.mockReturnValue(false);
      cache.get.mockResolvedValue(null);
      (prisma.blockedIp.findFirst as jest.Mock).mockResolvedValue({ reason: 'abuse' });

      await expect(service.isBlocked('1.1.1.1')).resolves.toEqual({
        blocked: true,
        reason: 'abuse',
      });
    });
  });
});
