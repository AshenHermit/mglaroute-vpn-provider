import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';
import { Subscription } from './subscription.entity';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new subscription' })
  @ApiResponse({ status: 201, description: 'Subscription created', type: Subscription })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSubscriptionDto): Promise<Subscription> {
    return this.subscriptionsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List subscriptions with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of subscriptions' })
  async findAll(@Query() query: QuerySubscriptionDto): Promise<{
    data: Subscription[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.subscriptionsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a subscription by ID' })
  @ApiParam({ name: 'id', description: 'Subscription UUID' })
  @ApiResponse({ status: 200, description: 'Subscription found', type: Subscription })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async findOne(@Param('id') id: string): Promise<Subscription> {
    return this.subscriptionsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a subscription' })
  @ApiParam({ name: 'id', description: 'Subscription UUID' })
  @ApiResponse({ status: 200, description: 'Subscription updated', type: Subscription })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto): Promise<Subscription> {
    return this.subscriptionsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a subscription' })
  @ApiParam({ name: 'id', description: 'Subscription UUID' })
  @ApiResponse({ status: 204, description: 'Subscription deleted' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.subscriptionsService.remove(id);
  }

  @Post(':id/fetch')
  @ApiOperation({ summary: 'Fetch and parse subscription (stub)' })
  @ApiParam({ name: 'id', description: 'Subscription UUID' })
  @ApiResponse({ status: 200, description: 'Fetch initiated', schema: { example: { ok: true, message: 'Fetch not yet implemented' } } })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async fetch(@Param('id') id: string): Promise<{ ok: boolean; message: string }> {
    return this.subscriptionsService.fetch(id);
  }
}