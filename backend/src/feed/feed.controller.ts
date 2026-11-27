import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedService } from './feed.service';

@Controller('feed')
@Public()
@ApiTags('Public feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('services')
  @ApiOperation({
    summary: 'Public enabled service names',
    description: 'Curated id/name pairs for the desktop feed builder. No auth required.',
  })
  async getServices(@Res() res: Response): Promise<void> {
    res.json(await this.feedService.listPublicServices());
  }

  @Get()
  @ApiOperation({
    summary: 'Public VPN server feed',
    description: 'Raw subscription links or detailed JSON from all active enabled subscriptions. No auth required.',
  })
  @ApiQuery({ name: 'format', required: false, enum: ['subscription', 'json'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'protocol', required: false, enum: ['vmess', 'vless', 'ss', 'trojan'] })
  @ApiQuery({ name: 'reachable', required: false, type: Boolean })
  @ApiQuery({ name: 'anycast', required: false, type: Boolean })
  @ApiQuery({ name: 'services', required: false, type: String, description: 'Comma-separated service ids' })
  @ApiQuery({
    name: 'sort', required: false, enum: [
      'latency_asc', 'latency_desc', 'confidence_asc', 'confidence_desc',
      'name_asc', 'name_desc', 'address_asc', 'address_desc',
      'port_asc', 'port_desc', 'protocol_asc', 'protocol_desc',
    ],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 200 })
  async getFeed(@Query() dto: FeedQueryDto, @Res() res: Response): Promise<void> {
    const result = await this.feedService.generate(dto);
    res.setHeader('Content-Type', result.contentType);
    res.send(result.body);
  }
}
