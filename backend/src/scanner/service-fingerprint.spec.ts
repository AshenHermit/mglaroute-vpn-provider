import { computeServicesFingerprint } from './service-fingerprint';

describe('computeServicesFingerprint', () => {
  const enabled = (services: Array<{ id: string; testUrls: string[]; isEnabled: boolean }>) =>
    services
      .filter((service) => service.isEnabled)
      .map(({ id, testUrls }) => ({ id, testUrls }));

  it('is stable when only URL order changes', () => {
    const a = computeServicesFingerprint([
      { id: 'svc-1', testUrls: ['https://a.test/', 'https://b.test/'] },
      { id: 'svc-2', testUrls: ['https://c.test/'] },
    ]);
    const b = computeServicesFingerprint([
      { id: 'svc-2', testUrls: ['https://c.test/'] },
      { id: 'svc-1', testUrls: ['https://b.test/', 'https://a.test/'] },
    ]);

    expect(a).toBe(b);
  });

  it('changes when a service is added or a URL is edited', () => {
    const base = [{ id: 'svc-1', testUrls: ['https://a.test/'] }];

    const added = computeServicesFingerprint([...base, { id: 'svc-2', testUrls: ['https://b.test/'] }]);
    const edited = computeServicesFingerprint([{ id: 'svc-1', testUrls: ['https://changed.test/'] }]);

    expect(added).not.toBe(computeServicesFingerprint(base));
    expect(edited).not.toBe(computeServicesFingerprint(base));
  });

  it('changes when a service is disabled by the caller filtering the enabled set', () => {
    const services = [
      { id: 'svc-1', testUrls: ['https://a.test/'], isEnabled: true },
      { id: 'svc-2', testUrls: ['https://b.test/'], isEnabled: true },
    ];

    const all = computeServicesFingerprint(enabled(services));
    const one = computeServicesFingerprint(enabled(services.map((s) => ({ ...s, isEnabled: s.id === 'svc-1' }))));

    expect(one).not.toBe(all);
  });

  it('returns a stable non-empty value for an empty enabled set', () => {
    const first = computeServicesFingerprint([]);
    const second = computeServicesFingerprint([]);

    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });
});
