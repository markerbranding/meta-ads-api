import { Controller, Get } from '@nestjs/common';
import { AppService } from '../app.service';

@Controller('meta')
export class MetaController {
  constructor(private readonly appService: AppService) {}

  @Get('exchange-token')
  async exchangeToken() {
    return this.appService.exchangeToken();
  }
}