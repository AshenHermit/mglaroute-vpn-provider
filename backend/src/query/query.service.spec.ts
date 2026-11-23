import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryService } from './query.service';
import { Profile } from '../profiles/profile.entity';
import { AnycastScore } from '../scanner/anycast-scores.entity';
import { ScannerSettings } from '../settings/settings.entity';

describe('QueryService', () => {
  let service: QueryService;
  let profileRepository: Repository<Profile>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryService,
        {
          provide: getRepositoryToken(Profile),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue({
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
            }),
          },
        },
        {
          provide: getRepositoryToken(AnycastScore),
          useValue: {},
        },
        {
          provide: getRepositoryToken(ScannerSettings),
          useValue: {
            findOne: jest.fn().mockResolvedValue({ anycastThreshold: 0.5 }),
          },
        },
      ],
    }).compile();

    service = module.get<QueryService>(QueryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty result for no profiles', async () => {
    const result = await service.queryServers({});
    expect(result).toEqual({ servers: [], total: 0, page: 1, limit: 20 });
  });
});