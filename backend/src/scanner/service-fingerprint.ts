import { createHash } from 'node:crypto';

export function computeServicesFingerprint(services: Array<{ id: string; testUrls: string[] }>): string {
  const encoded = [...services]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((service) => `${service.id}:${[...(service.testUrls || [])].sort().join(',')}`)
    .join('|');

  return createHash('sha256').update(encoded).digest('hex');
}
