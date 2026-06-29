import { IpEnricherService } from './ip-enricher.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

describe('IpEnricherService', () => {
  let httpService: jest.Mocked<HttpService>;
  let prisma: jest.Mocked<PrismaService>;
  let config: jest.Mocked<ConfigService>;
  let service: IpEnricherService;

  beforeEach(() => {
    httpService = { axiosRef: { get: jest.fn() } } as unknown as jest.Mocked<HttpService>;
    prisma = { visitor: { update: jest.fn() } } as unknown as jest.Mocked<PrismaService>;
    config = { get: jest.fn().mockReturnValue(3000) } as unknown as jest.Mocked<ConfigService>;
    service = new IpEnricherService(httpService, prisma, config);
  });

  it('updates the visitor on a successful ip-api.com response', async () => {
    (httpService.axiosRef.get as jest.Mock).mockResolvedValue({
      data: { status: 'success', country: 'Indonesia', city: 'Jakarta', isp: 'Telkom', timezone: 'Asia/Jakarta' },
    });

    await service.enrichAndSave('visitor-1', '8.8.8.8');

    expect(prisma.visitor.update).toHaveBeenCalledWith({
      where: { id: 'visitor-1' },
      data: { country: 'Indonesia', city: 'Jakarta', isp: 'Telkom', timezone: 'Asia/Jakarta' },
    });
  });

  it('skips the update when ip-api.com reports status=fail', async () => {
    (httpService.axiosRef.get as jest.Mock).mockResolvedValue({ data: { status: 'fail' } });

    await service.enrichAndSave('visitor-1', '8.8.8.8');

    expect(prisma.visitor.update).not.toHaveBeenCalled();
  });

  it('swallows network errors/timeouts and never throws', async () => {
    (httpService.axiosRef.get as jest.Mock).mockRejectedValue(new Error('timeout'));

    await expect(service.enrichAndSave('visitor-1', '8.8.8.8')).resolves.toBeUndefined();
    expect(prisma.visitor.update).not.toHaveBeenCalled();
  });
});
