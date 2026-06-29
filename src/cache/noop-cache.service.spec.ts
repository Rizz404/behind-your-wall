import { NoopCacheService } from './noop-cache.service';

describe('NoopCacheService', () => {
  const service = new NoopCacheService();

  it('isEnabled() is false', () => {
    expect(service.isEnabled()).toBe(false);
  });

  it('get() always returns null (always a miss)', async () => {
    await expect(service.get('any:key')).resolves.toBeNull();
  });

  it('set() and del() are no-ops that never throw', async () => {
    await expect(service.set('any:key', 'value')).resolves.toBeUndefined();
    await expect(service.del('any:key')).resolves.toBeUndefined();
  });
});
