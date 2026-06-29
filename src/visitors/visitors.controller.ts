import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VisitorsService } from './visitors.service';
import { ListVisitorsQueryDto } from './dto/list-visitors-query.dto';

@Controller('v1/visitors')
@UseGuards(JwtAuthGuard)
export class VisitorsController {
  constructor(private readonly visitorsService: VisitorsService) {}

  @Get()
  findAll(@Query() query: ListVisitorsQueryDto) {
    return this.visitorsService.findAll(query);
  }

  @Get(':fingerprintId')
  findOne(@Param('fingerprintId') fingerprintId: string) {
    return this.visitorsService.findByFingerprintId(fingerprintId);
  }
}
