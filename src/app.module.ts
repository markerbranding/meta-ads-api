import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MetaController } from './meta/meta.controller';
import { TokenMonitorModule } from './token-monitor/token-monitor.module';
import { TokenMonitorService } from './token-monitor/token-monitor.service';

@Module({
  imports: [
    ScheduleModule.forRoot(), // ⏰ Habilita las tareas programadas
    TokenMonitorModule,
    ConfigModule.forRoot({ isGlobal: true }), // ✅ importante para leer .env globalmente
  ],
  controllers: [AppController, MetaController],
  providers: [AppService, TokenMonitorService],
})
export class AppModule {}