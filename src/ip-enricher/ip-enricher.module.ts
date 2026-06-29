import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { IpEnricherService } from './ip-enricher.service';

@Module({
  imports: [HttpModule],
  providers: [IpEnricherService],
  exports: [IpEnricherService],
})
export class IpEnricherModule {}
