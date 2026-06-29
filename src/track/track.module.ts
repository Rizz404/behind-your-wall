import { Module } from '@nestjs/common';
import { SitesModule } from '../sites/sites.module';
import { BlocklistModule } from '../blocklist/blocklist.module';
import { IpEnricherModule } from '../ip-enricher/ip-enricher.module';
import { TrackService } from './track.service';
import { TrackController } from './track.controller';
import { SiteKeyGuard } from '../common/guards/site-key.guard';

@Module({
  imports: [SitesModule, BlocklistModule, IpEnricherModule],
  controllers: [TrackController],
  providers: [TrackService, SiteKeyGuard],
})
export class TrackModule {}
