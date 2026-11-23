import { Controller, Get, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ScannerService } from './scanner.service';

@ApiTags('Scanner')
@ApiBearerAuth()
@Controller('scanner')
@UseGuards(JwtAuthGuard)
export class ScannerController {
  constructor(private scannerService: ScannerService) {}

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Manually trigger a scan' })
  @ApiResponse({ status: 202, description: 'Scan started' })
  async run() {
    // Fire and forget
    this.scannerService.runScan().catch(() => {});
    return { started: true };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get scanner status' })
  @ApiResponse({ status: 200, description: 'Scanner status' })
  status() {
    return this.scannerService.getStatus();
  }
}