import { SelectQueryBuilder } from 'typeorm';
import { Profile } from '../profiles/profile.entity';

export interface ServerFilters {
  search?: string;
  protocol?: string;
  reachable?: boolean;
  services?: string[];
  anycast?: boolean;
}

export function applyServerFilters(
  qb: SelectQueryBuilder<Profile>,
  filters: ServerFilters,
  threshold: number,
): void {
  qb.andWhere('profile.present = :present', { present: true });

  if (filters.search) {
    qb.andWhere(
      '(profile.remarks ILIKE :search OR profile.name ILIKE :search OR profile.address ILIKE :search)',
      { search: `%${filters.search}%` },
    );
  }

  if (filters.protocol) {
    qb.andWhere('profile.protocol = :protocol', { protocol: filters.protocol });
  }

  if (filters.reachable !== undefined) {
    qb.andWhere('profile.lastReachable = :reachable', { reachable: filters.reachable });
  }

  if (filters.services?.length) {
    qb.andWhere('profile.serviceIds @> :serviceIds::jsonb', {
      serviceIds: JSON.stringify(filters.services),
    });
  }

  if (filters.anycast !== undefined) {
    if (filters.anycast === true) {
      qb.andWhere('profile.anycastScore >= :threshold', { threshold });
    } else {
      qb.andWhere('(profile.anycastScore < :threshold OR profile.anycastScore IS NULL)', { threshold });
    }
  }
}

export function applyServerSort(qb: SelectQueryBuilder<Profile>, sort?: string): void {
  switch (sort) {
    case 'latency_desc':
      qb.orderBy('profile.lastLatencyMs', 'DESC', 'NULLS LAST');
      break;
    case 'confidence_desc':
      qb.orderBy('profile.anycastScore', 'DESC', 'NULLS LAST');
      break;
    case 'confidence_asc':
      qb.orderBy('profile.anycastScore', 'ASC', 'NULLS LAST');
      break;
    case 'name_asc':
      qb.orderBy('profile.name', 'ASC', 'NULLS LAST');
      break;
    case 'name_desc':
      qb.orderBy('profile.name', 'DESC', 'NULLS LAST');
      break;
    case 'address_asc':
      qb.orderBy('profile.address', 'ASC', 'NULLS LAST');
      break;
    case 'address_desc':
      qb.orderBy('profile.address', 'DESC', 'NULLS LAST');
      break;
    case 'port_asc':
      qb.orderBy('profile.port', 'ASC', 'NULLS LAST');
      break;
    case 'port_desc':
      qb.orderBy('profile.port', 'DESC', 'NULLS LAST');
      break;
    case 'protocol_asc':
      qb.orderBy('profile.protocol', 'ASC', 'NULLS LAST');
      break;
    case 'protocol_desc':
      qb.orderBy('profile.protocol', 'DESC', 'NULLS LAST');
      break;
    case 'latency_asc':
    default:
      qb.orderBy('profile.lastLatencyMs', 'ASC', 'NULLS LAST');
  }
}
