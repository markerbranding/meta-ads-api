import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // ✅ importa esto
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MetaController } from './meta/meta.controller'; // 👈 agrega esto

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // ✅ importante para leer .env globalmente
  ],
  controllers: [AppController, MetaController],
  providers: [AppService],
})
export class AppModule {}