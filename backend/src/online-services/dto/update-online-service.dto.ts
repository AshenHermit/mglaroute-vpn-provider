import { PartialType } from '@nestjs/swagger';
import { CreateOnlineServiceDto } from './create-online-service.dto';

export class UpdateOnlineServiceDto extends PartialType(CreateOnlineServiceDto) {}