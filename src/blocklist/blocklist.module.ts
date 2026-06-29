import { Module } from '@nestjs/common';
import { BlocklistService } from './blocklist.service';
import { BlocklistController } from './blocklist.controller';

@Module({
  controllers: [BlocklistController],
  providers: [BlocklistService],
  exports: [BlocklistService],
})
export class BlocklistModule {}
