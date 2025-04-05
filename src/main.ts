/*import * as crypto from 'crypto';
global.crypto = crypto as any;*/

import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  // Solo asigna si no existe
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: false,
    enumerable: true,
    writable: false,
  });
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Si existe el archivo generado, lo usamos como fuente principal
if (fs.existsSync('.env.generated')) {
  dotenv.config({ path: '.env.generated' });
  console.log('✅ Variables cargadas desde .env.generated');
} else {
  dotenv.config();
  console.log('✅ Variables cargadas desde .env');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
