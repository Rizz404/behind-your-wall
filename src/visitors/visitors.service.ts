import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListVisitorsQueryDto } from './dto/list-visitors-query.dto';

@Injectable()
export class VisitorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListVisitorsQueryDto) {
    const where: Prisma.VisitorWhereInput = {};
    if (query.country) where.country = query.country;
    if (query.from || query.to) {
      where.lastSeenAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.visitor.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { lastSeenAt: 'desc' },
      }),
      this.prisma.visitor.count({ where }),
    ]);

    return { items, total, skip: query.skip ?? 0, take: query.take ?? 25 };
  }

  async findByFingerprintId(fingerprintId: string) {
    const visitor = await this.prisma.visitor.findUnique({
      where: { fingerprintId },
      include: { fingerprintComponent: true },
    });
    if (!visitor) throw new NotFoundException('Visitor not found');

    const visitLogs = await this.prisma.visitLog.findMany({
      where: { visitorId: visitor.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { ...visitor, visitLogs };
  }
}
