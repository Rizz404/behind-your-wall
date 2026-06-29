import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SiteKeyGuard } from './site-key.guard';
import { SitesService } from '../../sites/sites.service';
import { CacheService } from '../../cache/cache.interface';

function makeContext(headers: Record<string, string>): ExecutionContext {
  const req: any = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('SiteKeyGuard', () => {
  let sitesService: jest.Mocked<SitesService>;
  let cache: jest.Mocked<CacheService>;
  let config: jest.Mocked<ConfigService>;
  let guard: SiteKeyGuard;

  beforeEach(() => {
    sitesService = { findByApiKey: jest.fn() } as unknown as jest.Mocked<SitesService>;
    cache = {
      isEnabled: jest.fn().mockReturnValue(true),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    config = { get: jest.fn().mockReturnValue(300) } as unknown as jest.Mocked<ConfigService>;
    guard = new SiteKeyGuard(sitesService, cache, config);
  });

  it('throws when X-Site-Key header is missing', async () => {
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('allows the request on a cache hit for an active site', async () => {
    cache.get.mockResolvedValue(JSON.stringify({ id: 's1', isActive: true }));
    const ctx = makeContext({ 'x-site-key': 'fts_abc' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(sitesService.findByApiKey).not.toHaveBeenCalled();
  });

  it('throws when the cached site is inactive', async () => {
    cache.get.mockResolvedValue(JSON.stringify({ id: 's1', isActive: false }));
    const ctx = makeContext({ 'x-site-key': 'fts_abc' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('falls back to the DB on a cache miss and populates the cache', async () => {
    cache.get.mockResolvedValue(null);
    sitesService.findByApiKey.mockResolvedValue({ id: 's1', isActive: true } as any);
    const ctx = makeContext({ 'x-site-key': 'fts_abc' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(sitesService.findByApiKey).toHaveBeenCalledWith('fts_abc');
    expect(cache.set).toHaveBeenCalled();
  });

  it('throws when the site key does not exist in the DB either', async () => {
    cache.get.mockResolvedValue(null);
    sitesService.findByApiKey.mockResolvedValue(null);
    const ctx = makeContext({ 'x-site-key': 'fts_unknown' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('treats a disabled cache (Noop) as an always-miss and falls back to the DB', async () => {
    cache.isEnabled.mockReturnValue(false);
    cache.get.mockResolvedValue(null);
    sitesService.findByApiKey.mockResolvedValue({ id: 's1', isActive: true } as any);
    const ctx = makeContext({ 'x-site-key': 'fts_abc' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(sitesService.findByApiKey).toHaveBeenCalledWith('fts_abc');
  });
});
