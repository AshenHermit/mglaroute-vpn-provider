import { Repository } from 'typeorm';
import { Profile } from '../profiles/profile.entity';

export async function upsertParsedProfiles(
  profilesRepository: Repository<Profile>,
  subscriptionId: string,
  parsed: Profile[],
): Promise<Profile[]> {
  const saved: Profile[] = [];
  for (const item of parsed) {
    const existing = await profilesRepository.findOne({
      where: { subscriptionId, serverId: item.serverId },
    });
    if (existing) {
      Object.assign(existing, {
        ...item,
        id: existing.id,
        subscriptionId,
        serverId: existing.serverId,
        name: existing.name || item.name,
        remarks: item.remarks ?? existing.remarks ?? null,
        present: true,
      });
      saved.push(await profilesRepository.save(existing) as Profile);
    } else {
      const profile = profilesRepository.create({
        ...item,
        subscriptionId,
        present: true,
      } as any);
      saved.push(await profilesRepository.save(profile) as unknown as Profile);
    }
  }
  return saved;
}

export async function markMissingParsedProfiles(
  profilesRepository: Repository<Profile>,
  subscriptionId: string,
  presentServerIds: string[],
): Promise<void> {
  if (!presentServerIds.length) return;
  const known = await profilesRepository.find({ where: { subscriptionId } });
  for (const profile of known) {
    if (!presentServerIds.includes(profile.serverId) && profile.present) {
      profile.present = false;
      await profilesRepository.save(profile);
    }
  }
}
