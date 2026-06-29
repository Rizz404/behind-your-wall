import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Site } from '@prisma/client';
import { CACHE_SERVICE, CacheService } from '../../cache/cache.interface';
import { SitesService } from '../../sites/sites.service';

const SITE_KEY_HEADER = 'x-site-key';

@Injectable()
export class SiteKeyGuard implements CanActivate {
  constructor(
    private readonly sitesService: SitesService,
    @Inject(CACHE_SERVICE) private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const apiKey = req.headers[SITE_KEY_HEADER];
    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      throw new UnauthorizedException('Missing X-Site-Key header');
    }

    const cacheKey = `site:key:${apiKey}`;
    const cached = await this.cache.get(cacheKey);
    let site: Site | null = cached ? (JSON.parse(cached) as Site) : null;

    if (!site) {
      site = await this.sitesService.findByApiKey(apiKey);
      if (site) {
        const ttlSeconds = this.config.get<number>('siteKeyCacheTtl') ?? 300;
        await this.cache.set(cacheKey, JSON.stringify(site), { ttlSeconds });
      }
    }

    if (!site || !site.isActive) {
      throw new UnauthorizedException('Invalid or inactive site key');
    }

    (req as Request & { site: Site }).site = site;
    return true;
  }
}
