import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { QueryService } from './query.service';
import { QueryServersDto } from './query.dto';

@Controller('servers')
@UseGuards(JwtAuthGuard)
export class QueryController {
  constructor(private queryService: QueryService) {}

  @Get()
  async queryServers(@Query() dto: QueryServersDto) {
    return this.queryService.queryServers(dto);
  }

  @Get('anycast')
  async getAnycastList() {
    return this.queryService.getAnycastList();
  }

  @Get(':id/anycast')
  async getAnycastDetail(@Param('id') id: string) {
    return this.queryService.getAnycastDetail(id);
  }
}