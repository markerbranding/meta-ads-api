import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { checkTokenExpirations } from '../utils/token-monitor';

@Injectable()
export class TokenMonitorService {
  @Cron('0 8 * * 1') // todos los lunes a las 8:00 AM
  async monitor() {
    console.log('🔁 Ejecutando verificación de tokens...');
    await checkTokenExpirations();
  }
}