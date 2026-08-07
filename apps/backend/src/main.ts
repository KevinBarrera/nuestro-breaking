import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '@/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  app.enableCors({ origin: 'http://localhost:5173' });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Nuestro Breaking API')
    .setDescription('HTTP API for the Nuestro Breaking application.')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/doc', app, document);

  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '127.0.0.1');
}
void bootstrap();
