import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Environment } from './http-config';

/** Swagger is a development aid; production does not publish the API map. */
export function isApiDocsEnabled(env: Environment): boolean {
  return env.NODE_ENV !== 'production';
}

/** Serves Swagger at `api/doc`, except in production. */
export function configureApiDocs(app: INestApplication, env: Environment = process.env): void {
  if (!isApiDocsEnabled(env)) return;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Los más pesados API')
    .setDescription('HTTP API for the Los más pesados application.')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/doc', app, document);
}
