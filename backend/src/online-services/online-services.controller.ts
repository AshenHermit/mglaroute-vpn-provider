import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OnlineServicesService } from './online-services.service';
import { CreateOnlineServiceDto } from './dto/create-online-service.dto';
import { UpdateOnlineServiceDto } from './dto/update-online-service.dto';
import { OnlineService } from './online-service.entity';

@ApiTags('Online Services')
@ApiBearerAuth()
@Controller('online-services')
@UseGuards(JwtAuthGuard)
export class OnlineServicesController {
  constructor(private onlineServicesService: OnlineServicesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new online service' })
  @ApiResponse({ status: 201, description: 'Online service created', type: OnlineService })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateOnlineServiceDto): Promise<OnlineService> {
    return this.onlineServicesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all online services' })
  @ApiResponse({ status: 200, description: 'List of online services', type: [OnlineService] })
  async findAll(): Promise<OnlineService[]> {
    return this.onlineServicesService.findAll();
  }

  @Get('enabled')
  @ApiOperation({ summary: 'Get enabled online services' })
  @ApiResponse({ status: 200, description: 'List of enabled online services', type: [OnlineService] })
  async getEnabled(): Promise<OnlineService[]> {
    return this.onlineServicesService.getEnabled();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an online service by ID' })
  @ApiParam({ name: 'id', description: 'Online service UUID' })
  @ApiResponse({ status: 200, description: 'Online service found', type: OnlineService })
  @ApiResponse({ status: 404, description: 'Online service not found' })
  async findOne(@Param('id') id: string): Promise<OnlineService> {
    return this.onlineServicesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an online service' })
  @ApiParam({ name: 'id', description: 'Online service UUID' })
  @ApiResponse({ status: 200, description: 'Online service updated', type: OnlineService })
  @ApiResponse({ status: 404, description: 'Online service not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateOnlineServiceDto): Promise<OnlineService> {
    return this.onlineServicesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an online service' })
  @ApiParam({ name: 'id', description: 'Online service UUID' })
  @ApiResponse({ status: 204, description: 'Online service deleted' })
  @ApiResponse({ status: 404, description: 'Online service not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.onlineServicesService.remove(id);
  }
}