import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface IpApiResponse {
  status: 'success' | 'fail';
  country?: string;
  city?: string;
  isp?: string;
  timezone?: string;
}

@Injectable()
export class IpEnricherService {
  private readonly logger = new Logger(IpEnricherService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Fire-and-forget: never throws, so callers must NOT await this on the request's hot path. */
  async enrichAndSave(visitorId: string, ip: string): Promise<void> {
    try {
      const timeout = this.config.get<number>('ipEnricherTimeoutMs') ?? 3000;
      const { data } = await this.httpService.axiosRef.get<IpApiResponse>(
        `http://ip-api.com/json/${ip}?fields=status,country,city,isp,timezone`,
        { timeout },
      );

      if (data.status !== 'success') return;

      await this.prisma.visitor.update({
        where: { id: visitorId },
        data: {
          country: data.country,
          city: data.city,
          isp: data.isp,
          timezone: data.timezone,
        },
      });
    } catch (err) {
      this.logger.warn(`IP enrichment failed for ${ip}: ${(err as Error).message}`);
    }
  }
}
