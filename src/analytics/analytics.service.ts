import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface DailyCount {
  day: Date;
  count: bigint;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [totalVisitors, totalVisits, topCountries, dailyVisits] = await Promise.all([
      this.prisma.visitor.count(),
      this.prisma.visitLog.count(),
      this.prisma.visitor.groupBy({
        by: ['country'],
        where: { country: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { country: 'desc' } },
        take: 10,
      }),
      this.prisma.$queryRaw<DailyCount[]>(Prisma.sql`
        SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
        FROM visit_logs
        WHERE created_at >= now() - interval '30 days'
        GROUP BY day
        ORDER BY day ASC
      `),
    ]);

    return {
      totalVisitors,
      totalVisits,
      topCountries: topCountries.map((c) => ({ country: c.country, count: c._count._all })),
      last30Days: dailyVisits.map((d) => ({ day: d.day, count: Number(d.count) })),
    };
  }
}
