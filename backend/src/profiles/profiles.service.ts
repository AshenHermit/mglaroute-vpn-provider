import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Profile } from './profile.entity';

export interface QueryProfilesDto {
  page?: number;
  limit?: number;
  subscriptionId?: string;
  search?: string;
  protocol?: string;
  reachable?: boolean;
}

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
  ) {}

  async findAll(query: QueryProfilesDto): Promise<{ data: Profile[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, subscriptionId, search, protocol, reachable } = query;
    const qb = this.profilesRepository.createQueryBuilder('profile');

    if (subscriptionId) {
      qb.where('profile.subscriptionId = :subscriptionId', { subscriptionId });
    }

    if (search) {
      qb.andWhere('(profile.name ILIKE :search OR profile.address ILIKE :search)', { search: `%${search}%` });
    }

    if (protocol) {
      qb.andWhere('profile.protocol = :protocol', { protocol });
    }

    if (reachable !== undefined) {
      qb.andWhere('profile.lastReachable = :reachable', { reachable });
    }

    qb.orderBy('profile.createdAt', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Profile> {
    const profile = await this.profilesRepository.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException(`Profile with ID ${id} not found`);
    }
    return profile;
  }

  async findBySubscription(subscriptionId: string): Promise<Profile[]> {
    return this.profilesRepository.find({
      where: { subscriptionId },
      order: { createdAt: 'DESC' },
    });
  }
}