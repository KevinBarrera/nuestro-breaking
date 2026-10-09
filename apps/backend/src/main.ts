import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '@/app.module';
import { configureHttp } from '@/http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  configureHttp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Los más pesados API')
    .setDescription('HTTP API for the Los más pesados application.')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/doc', app, document);

  // Blank values (empty lines copied from .env.example) fall back to the defaults.
  await app.listen(process.env.PORT?.trim() || 3000, process.env.HOST?.trim() || '127.0.0.1');
}
void bootstrap();
