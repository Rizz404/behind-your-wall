import { RedisCacheService } from './redis-cache.service';

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    quit: jest.fn(),
    get: jest.fn().mockRejectedValue(new Error('connection lost')),
    set: jest.fn().mockRejectedValue(new Error('connection lost')),
    del: jest.fn().mockRejectedValue(new Error('connection lost')),
  })),
}));

describe('RedisCacheService', () => {
  it('reports isEnabled() === true', () => {
    const service = new RedisCacheService('redis://localhost:6379');
    expect(service.isEnabled()).toBe(true);
  });

  it('treats a get() failure as a cache miss instead of throwing', async () => {
    const service = new RedisCacheService('redis://localhost:6379');
    await expect(service.get('some:key')).resolves.toBeNull();
  });

  it('swallows set() and del() failures without throwing', async () => {
    const service = new RedisCacheService('redis://localhost:6379');
    await expect(service.set('some:key', 'value')).resolves.toBeUndefined();
    await expect(service.del('some:key')).resolves.toBeUndefined();
  });
});
