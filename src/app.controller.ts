import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('ads/meta')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get(':cliente')
  async getMetaData(
    @Param('cliente') cliente: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.appService.getMetaAdsData(cliente, start, end);
  }
  
  @Get('exchange-token')
  async exchangeToken() {
    return this.appService.exchangeToken();
  }


}


