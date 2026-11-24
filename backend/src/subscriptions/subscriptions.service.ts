import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Subscription, SubscriptionStatus } from './subscription.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';
import { Profile } from '../profiles/profile.entity';
import { ParserService } from '../scanner/parser.service';
import { markMissingParsedProfiles, upsertParsedProfiles } from '../scanner/profile-upsert.helper';
import axios from 'axios';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    private parserService: ParserService,
  ) {}

  async create(dto: CreateSubscriptionDto): Promise<Subscription> {
    const subscription = this.subscriptionsRepository.create(dto);
    return this.subscriptionsRepository.save(subscription);
  }

  async findAll(query: QuerySubscriptionDto): Promise<{ data: Subscription[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, search, status } = query;
    const qb = this.subscriptionsRepository.createQueryBuilder('subscription');

    if (search) {
      qb.where('subscription.name ILIKE :search', { search: `%${search}%` });
    }

    if (status) {
      qb.andWhere('subscription.status = :status', { status });
    }

    qb.orderBy('subscription.createdAt', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Subscription> {
    const subscription = await this.subscriptionsRepository.findOne({ where: { id } });
    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }
    return subscription;
  }

  async update(id: string, dto: UpdateSubscriptionDto): Promise<Subscription> {
    const subscription = await this.findOne(id);
    Object.assign(subscription, dto);
    return this.subscriptionsRepository.save(subscription);
  }

  async remove(id: string): Promise<void> {
    const subscription = await this.findOne(id);
    await this.subscriptionsRepository.remove(subscription);
  }

  async fetch(id: string): Promise<{ ok: boolean; message: string; parsed?: number }> {
    const subscription = await this.findOne(id);
    try {
      const response = await axios.get(subscription.url, { timeout: 10000, proxy: false });
      const { profiles } = this.parserService.parseSubscriptionText(String(response.data ?? ''));
      await upsertParsedProfiles(this.profilesRepository, id, profiles as Profile[]);
      await markMissingParsedProfiles(this.profilesRepository, id, profiles.map((p) => p.serverId!));
      await this.setServerCount(id, profiles.length);
      await this.updateStatus(id, SubscriptionStatus.ACTIVE);
      return { ok: true, message: `Fetched ${profiles.length} servers`, parsed: profiles.length };
    } catch (err: any) {
      await this.markFetchError(id, err.message);
      return { ok: false, message: err.message };
    }
  }

  async updateStatus(id: string, status: SubscriptionStatus, lastError?: string): Promise<Subscription> {
    const subscription = await this.findOne(id);
    subscription.status = status;
    if (lastError !== undefined) {
      subscription.lastError = lastError;
    }
    if (status === SubscriptionStatus.ACTIVE) {
      subscription.lastFetchedAt = new Date();
    }
    return this.subscriptionsRepository.save(subscription);
  }

  async markFetchError(id: string, message: string): Promise<void> {
    const subscription = await this.findOne(id);
    subscription.status = SubscriptionStatus.ERROR;
    subscription.lastError = message;
    await this.subscriptionsRepository.save(subscription);
  }

  async incrementServerCount(id: string, count: number): Promise<void> {
    await this.subscriptionsRepository.increment({ id }, 'serverCount', count);
  }

  async setServerCount(id: string, count: number): Promise<void> {
    await this.subscriptionsRepository.update({ id }, { serverCount: count });
  }
}