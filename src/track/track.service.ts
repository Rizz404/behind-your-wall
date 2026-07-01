import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BlocklistService } from '../blocklist/blocklist.service';
import { IpEnricherService } from '../ip-enricher/ip-enricher.service';
import { TrackDto } from './dto/track.dto';
import { getCountryFromTimezone } from '../common/utils/timezone-country.util';

interface UpsertedVisitorRow {
  id: string;
  visit_count: number;
  is_new: boolean;
}

export interface TrackResult {
  tracked: boolean;
  blocked: boolean;
}

@Injectable()
export class TrackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocklistService: BlocklistService,
    private readonly ipEnricherService: IpEnricherService,
  ) {}

  async track(dto: TrackDto, ip: string, siteId: string): Promise<TrackResult> {
    const { blocked } = await this.blocklistService.isBlocked(ip);
    if (blocked) {
      return { tracked: false, blocked: true };
    }

    const { id: visitorId, isNew } = await this.upsertVisitor(dto.fingerprintId);

    if (isNew) {
      // fire-and-forget — must not block the response, IpEnricherService never throws
      this.ipEnricherService.enrichAndSave(visitorId, ip).catch(() => undefined);
      await this.upsertFingerprintComponents(visitorId, dto);
    }

    // Derive country from client-side timezone — VPN-resistant, O(1) lookup
    if (dto.timezone) {
      const timezoneCountry = getCountryFromTimezone(dto.timezone);
      if (timezoneCountry) {
        await this.prisma.visitor.update({
          where: { id: visitorId },
          data: { timezoneCountry },
        });
      }
    }

    await this.prisma.visitLog.create({
      data: {
        visitorId,
        siteId,
        ip,
        pageUrl: dto.pageUrl,
        referrer: dto.referrer,
        userAgent: dto.userAgent,
        browser: dto.browser,
        os: dto.os,
        deviceType: dto.deviceType,
        screenRes: dto.screenRes,
        language: dto.language,
        timezone: dto.timezone,
        uaBrands: dto.uaBrands as Prisma.InputJsonValue,
        uaMobile: dto.uaMobile,
        uaPlatform: dto.uaPlatform,
        uaPlatformVersion: dto.uaPlatformVersion,
        geoLat: dto.geoLat,
        geoLon: dto.geoLon,
        geoAccuracy: dto.geoAccuracy,
      },
    });

    return { tracked: true, blocked: false };
  }

  /**
   * Atomic upsert-by-fingerprint via raw SQL: two concurrent first-visits with the same
   * fingerprint must collapse into a single row. Prisma's `upsert()` cannot guarantee this
   * (it isn't a single atomic statement on every connector), so this is the one deliberate
   * escape hatch out of the Prisma Client API in this codebase. The `(xmax = 0)` trick reports
   * whether this call inserted (true) or hit the conflict branch and updated (false).
   */
  private async upsertVisitor(fingerprintId: string): Promise<{ id: string; isNew: boolean }> {
    const rows = await this.prisma.$queryRaw<UpsertedVisitorRow[]>(Prisma.sql`
      INSERT INTO visitors (id, fingerprint_id, visit_count, first_seen_at, last_seen_at)
      VALUES (gen_random_uuid(), ${fingerprintId}, 1, now(), now())
      ON CONFLICT (fingerprint_id) DO UPDATE
        SET visit_count = visitors.visit_count + 1,
            last_seen_at = now()
      RETURNING id, visit_count, (xmax = 0) AS is_new
    `);

    const row = rows[0];
    return { id: row.id, isNew: row.is_new };
  }

  private async upsertFingerprintComponents(visitorId: string, dto: TrackDto): Promise<void> {
    await this.prisma.fingerprintComponent.upsert({
      where: { visitorId },
      create: {
        visitorId,
        canvasHash: dto.canvasHash,
        webglHash: dto.webglHash,
        audioHash: dto.audioHash,
        raw: dto.rawComponents as Prisma.InputJsonValue,
        uaChRaw: dto.uaChRaw as Prisma.InputJsonValue,
      },
      update: {
        canvasHash: dto.canvasHash,
        webglHash: dto.webglHash,
        audioHash: dto.audioHash,
        raw: dto.rawComponents as Prisma.InputJsonValue,
        uaChRaw: dto.uaChRaw as Prisma.InputJsonValue,
      },
    });
  }
}
