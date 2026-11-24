import 'reflect-metadata';
import { applyServerFilters, applyServerSort } from './server-filter';

function makeQb() {
  return {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  };
}

describe('applyServerFilters', () => {
  it('always restricts to present profiles', () => {
    const qb = makeQb();
    applyServerFilters(qb as any, {}, 0.5);
    expect(qb.andWhere).toHaveBeenCalledWith('profile.present = :present', { present: true });
  });

  it('applies search, protocol and reachable clauses', () => {
    const qb = makeQb();
    applyServerFilters(
      qb as any,
      { search: 'ru', protocol: 'vless', reachable: false },
      0.5,
    );
    const clauses = qb.andWhere.mock.calls.map((call) => String(call[0]));
    expect(clauses.some((c) => c.includes('ILIKE :search'))).toBe(true);
    expect(clauses).toContain('profile.protocol = :protocol');
    expect(clauses).toContain('profile.lastReachable = :reachable');
  });

  it('requires all requested services to be reachable', () => {
    const qb = makeQb();
    applyServerFilters(qb as any, { services: ['a', 'b'] }, 0.5);
    expect(qb.andWhere).toHaveBeenCalledWith('profile.serviceIds @> :serviceIds::jsonb', {
      serviceIds: JSON.stringify(['a', 'b']),
    });
  });

  it('stable score zero is excluded by anycast=true and included by anycast=false', () => {
    const yes = makeQb();
    const no = makeQb();
    applyServerFilters(yes as any, { anycast: true }, 0.5);
    applyServerFilters(no as any, { anycast: false }, 0.5);

    expect(yes.andWhere).toHaveBeenCalledWith('profile.anycastScore >= :threshold', { threshold: 0.5 });
    expect(no.andWhere).toHaveBeenCalledWith(
      '(profile.anycastScore < :threshold OR profile.anycastScore IS NULL)',
      { threshold: 0.5 },
    );
  });

  it('uses the configured threshold for anycast filters', () => {
    const yes = makeQb();
    const no = makeQb();
    applyServerFilters(yes as any, { anycast: true }, 0.7);
    applyServerFilters(no as any, { anycast: false }, 0.7);
    expect(yes.andWhere).toHaveBeenCalledWith('profile.anycastScore >= :threshold', { threshold: 0.7 });
    expect(no.andWhere).toHaveBeenCalledWith(
      '(profile.anycastScore < :threshold OR profile.anycastScore IS NULL)',
      { threshold: 0.7 },
    );
  });
});

describe('applyServerSort', () => {
  it('defaults to latency ascending with nulls last', () => {
    const qb = makeQb();
    applyServerSort(qb as any, undefined);
    expect(qb.orderBy).toHaveBeenCalledWith('profile.lastLatencyMs', 'ASC', 'NULLS LAST');
  });

  it('sorts by confidence descending', () => {
    const qb = makeQb();
    applyServerSort(qb as any, 'confidence_desc');
    expect(qb.orderBy).toHaveBeenCalledWith('profile.anycastScore', 'DESC', 'NULLS LAST');
  });

  it('falls back to latency for an unknown sort', () => {
    const qb = makeQb();
    applyServerSort(qb as any, 'bogus');
    expect(qb.orderBy).toHaveBeenCalledWith('profile.lastLatencyMs', 'ASC', 'NULLS LAST');
  });
});
