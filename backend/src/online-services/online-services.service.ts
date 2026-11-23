import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { OnlineService } from './online-service.entity';
import { CreateOnlineServiceDto } from './dto/create-online-service.dto';
import { UpdateOnlineServiceDto } from './dto/update-online-service.dto';

@Injectable()
export class OnlineServicesService implements OnModuleInit {
  constructor(
    @InjectRepository(OnlineService)
    private onlineServicesRepository: Repository<OnlineService>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
  }

  private async seedDefaults(): Promise<void> {
    const defaults = [
      { name: 'YouTube', testUrls: ['https://www.youtube.com'], isDefault: true },
      { name: 'Discord', testUrls: ['https://discord.com'], isDefault: true },
      { name: 'Google', testUrls: ['https://www.google.com'], isDefault: true },
    ];

    for (const defaultService of defaults) {
      const existing = await this.onlineServicesRepository.findOne({ where: { name: defaultService.name } });
      if (!existing) {
        const service = this.onlineServicesRepository.create(defaultService);
        await this.onlineServicesRepository.save(service);
      }
    }
  }

  async create(dto: CreateOnlineServiceDto): Promise<OnlineService> {
    const service = this.onlineServicesRepository.create(dto);
    return this.onlineServicesRepository.save(service);
  }

  async findAll(): Promise<OnlineService[]> {
    return this.onlineServicesRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<OnlineService> {
    const service = await this.onlineServicesRepository.findOne({ where: { id } });
    if (!service) {
      throw new NotFoundException(`Online service with ID ${id} not found`);
    }
    return service;
  }

  async update(id: string, dto: UpdateOnlineServiceDto): Promise<OnlineService> {
    const service = await this.findOne(id);
    Object.assign(service, dto);
    return this.onlineServicesRepository.save(service);
  }

  async remove(id: string): Promise<void> {
    const service = await this.findOne(id);
    await this.onlineServicesRepository.remove(service);
  }

  async getEnabled(): Promise<OnlineService[]> {
    return this.onlineServicesRepository.find({ where: { isEnabled: true } });
  }
}