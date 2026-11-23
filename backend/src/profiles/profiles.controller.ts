import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProfilesService, QueryProfilesDto } from './profiles.service';
import { Profile } from './profile.entity';

@ApiTags('Profiles')
@ApiBearerAuth()
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private profilesService: ProfilesService) {}

  @Get()
  @ApiOperation({ summary: 'List profiles with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'subscriptionId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'protocol', required: false, type: String, enum: ['vmess', 'vless', 'ss', 'trojan'] })
  @ApiQuery({ name: 'reachable', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Paginated list of profiles' })
  async findAll(@Query() query: QueryProfilesDto): Promise<{
    data: Profile[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.profilesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a profile by ID' })
  @ApiParam({ name: 'id', description: 'Profile UUID' })
  @ApiResponse({ status: 200, description: 'Profile found', type: Profile })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async findOne(@Param('id') id: string): Promise<Profile> {
    return this.profilesService.findOne(id);
  }

  @Get('subscription/:subscriptionId')
  @ApiOperation({ summary: 'Get all profiles for a subscription' })
  @ApiParam({ name: 'subscriptionId', description: 'Subscription UUID' })
  @ApiResponse({ status: 200, description: 'List of profiles for subscription', type: [Profile] })
  async findBySubscription(@Param('subscriptionId') subscriptionId: string): Promise<Profile[]> {
    return this.profilesService.findBySubscription(subscriptionId);
  }
}