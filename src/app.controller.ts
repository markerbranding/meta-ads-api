import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Ruta raíz: /
  @Get()
  getRoot() {
    return { message: 'API Meta Ads activa ✅' };
  }

  // Ruta para obtener campañas: /ads/meta/:cliente
  @Get('ads/meta/:cliente')
  async getMetaData(
    @Param('cliente') cliente: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.appService.getMetaAdsData(cliente, start, end);
  }

  // Ruta para intercambiar token: /ads/meta/exchange-token
  @Get('ads/meta/exchange-token')
  async exchangeToken() {
    return this.appService.exchangeToken();
  }

  // Creatives para thumbs
  @Get('ads/meta/:cliente/creatives')
  async getCreatives(@Param('cliente') cliente: string) {
    return this.appService.getAdCreatives(cliente);
  }

}