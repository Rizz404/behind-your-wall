import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Site } from '@prisma/client';
import { SiteKeyGuard } from '../common/guards/site-key.guard';
import { GetIp } from '../common/decorators/get-ip.decorator';
import { CurrentSite } from '../common/decorators/current-site.decorator';
import { TrackService, TrackResult } from './track.service';
import { TrackDto } from './dto/track.dto';

@Controller('v1/track')
@UseGuards(SiteKeyGuard, ThrottlerGuard)
export class TrackController {
  constructor(private readonly trackService: TrackService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  track(
    @Body() dto: TrackDto,
    @GetIp() ip: string,
    @CurrentSite() site: Site,
  ): Promise<TrackResult> {
    return this.trackService.track(dto, ip, site.id);
  }
}
