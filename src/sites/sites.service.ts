import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Site } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSiteDto): Promise<Site> {
    return this.prisma.site.create({
      data: {
        name: dto.name,
        domain: dto.domain,
        apiKey: this.generateApiKey(dto.domain),
      },
    });
  }

  async findAll(): Promise<Site[]> {
    return this.prisma.site.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findByApiKey(apiKey: string): Promise<Site | null> {
    return this.prisma.site.findUnique({ where: { apiKey } });
  }

  async deactivate(id: string): Promise<Site> {
    const site = await this.prisma.site.findUnique({ where: { id } });
    if (!site) throw new NotFoundException('Site not found');
    return this.prisma.site.update({ where: { id }, data: { isActive: false } });
  }

  private generateApiKey(domain: string): string {
    const slug = domain
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const random = randomBytes(16).toString('hex');
    return `fts_${slug}_${random}`;
  }
}
