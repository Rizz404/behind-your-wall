import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentAdmin, AuthenticatedAdmin } from '../common/decorators/current-admin.decorator';
import { BlocklistService } from './blocklist.service';
import { CreateBlockedIpDto } from './dto/create-blocked-ip.dto';

@Controller('v1/blocklist')
export class BlocklistController {
  constructor(private readonly blocklistService: BlocklistService) {}

  @Get('check/:ip')
  check(@Param('ip') ip: string) {
    return this.blocklistService.isBlocked(ip);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.blocklistService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateBlockedIpDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.blocklistService.create(dto, admin);
  }

  @Delete(':ip')
  @UseGuards(JwtAuthGuard)
  remove(@Param('ip') ip: string) {
    return this.blocklistService.remove(ip);
  }
}
