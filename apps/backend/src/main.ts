import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { configureApiDocs, configureHttp } from '@/http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  configureHttp(app);
  configureApiDocs(app);

  // Blank values (empty lines copied from .env.example) fall back to the defaults.
  await app.listen(process.env.PORT?.trim() || 3000, process.env.HOST?.trim() || '127.0.0.1');
}
void bootstrap();
