import { Module } from '@nestjs/common';
import { TokenMonitorService } from './token-monitor.service';

@Module({
  providers: [TokenMonitorService],
})
export class TokenMonitorModule {}