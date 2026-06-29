import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { SitesModule } from './sites/sites.module';
import { TrackModule } from './track/track.module';
import { VisitorsModule } from './visitors/visitors.module';
import { BlocklistModule } from './blocklist/blocklist.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { IpEnricherModule } from './ip-enricher/ip-enricher.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    PrismaModule,
    CacheModule,
    AuthModule,
    SitesModule,
    TrackModule,
    VisitorsModule,
    BlocklistModule,
    AnalyticsModule,
    IpEnricherModule,
  ],
})
export class AppModule {}
