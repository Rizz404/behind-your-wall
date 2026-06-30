import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Requires a real Postgres reachable via DATABASE_URL. Run with REDIS_URL unset: the
 * "blocked IP" case below seeds blocked_ips directly via Prisma (bypassing BlocklistService,
 * so the cache is never populated) — with the cache layer enabled that would read as a false
 * "not blocked" instead of falling back to the DB. This is also the documented way to exercise
 * the Noop cache path end-to-end.
 */
describe('POST /v1/sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let siteApiKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    const site = await prisma.site.create({
      data: { name: 'Test Site', domain: `test-${randomUUID()}.example.com`, apiKey: `fts_test_${randomUUID()}` },
    });
    siteApiKey = site.apiKey;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests without X-Site-Key', async () => {
    await request(app.getHttpServer())
      .post('/v1/sync')
      .send({ fingerprintId: randomUUID() })
      .expect(401);
  });

  it('tracks a new visitor and creates a visit log row', async () => {
    const fingerprintId = randomUUID();

    const res = await request(app.getHttpServer())
      .post('/v1/sync')
      .set('X-Site-Key', siteApiKey)
      .send({ fingerprintId, pageUrl: 'https://example.com/' })
      .expect(201);

    expect(res.body).toEqual({ tracked: true, blocked: false });

    const visitor = await prisma.visitor.findUnique({ where: { fingerprintId } });
    expect(visitor).not.toBeNull();
    expect(visitor!.visitCount).toBe(1);

    const logs = await prisma.visitLog.findMany({ where: { visitorId: visitor!.id } });
    expect(logs).toHaveLength(1);
  });

  it('increments visit_count on a repeat visit instead of creating a second visitor', async () => {
    const fingerprintId = randomUUID();

    await request(app.getHttpServer())
      .post('/v1/sync')
      .set('X-Site-Key', siteApiKey)
      .send({ fingerprintId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/sync')
      .set('X-Site-Key', siteApiKey)
      .send({ fingerprintId })
      .expect(201);

    const visitors = await prisma.visitor.findMany({ where: { fingerprintId } });
    expect(visitors).toHaveLength(1);
    expect(visitors[0].visitCount).toBe(2);
  });

  it('collapses two concurrent first-visits with the same fingerprint into one visitor row', async () => {
    const fingerprintId = randomUUID();

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/v1/sync')
        .set('X-Site-Key', siteApiKey)
        .send({ fingerprintId }),
      request(app.getHttpServer())
        .post('/v1/sync')
        .set('X-Site-Key', siteApiKey)
        .send({ fingerprintId }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const visitors = await prisma.visitor.findMany({ where: { fingerprintId } });
    expect(visitors).toHaveLength(1);
    expect(visitors[0].visitCount).toBe(2);
  });

  it('returns blocked=true and skips persistence when the request IP is blocked', async () => {
    const blockedIp = '203.0.113.55';
    await prisma.blockedIp.create({ data: { ip: blockedIp, reason: 'e2e test' } });

    const fingerprintId = randomUUID();
    const res = await request(app.getHttpServer())
      .post('/v1/sync')
      .set('X-Site-Key', siteApiKey)
      .set('X-Forwarded-For', blockedIp)
      .send({ fingerprintId })
      .expect(201);

    expect(res.body).toEqual({ tracked: false, blocked: true });

    const visitor = await prisma.visitor.findUnique({ where: { fingerprintId } });
    expect(visitor).toBeNull();
  });
});
