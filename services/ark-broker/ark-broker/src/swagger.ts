import swaggerJsdoc from 'swagger-jsdoc';
import {Express} from 'express';
import swaggerUi from 'swagger-ui-express';
import type {Logger} from './logging/logger.js';

export type SwaggerDeps = {
  logger: Logger;
  version: string;
  host: string;
  port: number;
};

export function setupSwagger(app: Express, deps: SwaggerDeps): void {
  const {logger, version, host, port} = deps;

  const options: swaggerJsdoc.Options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'ARK Broker API',
        version,
        description: 'Memory and streaming service for ARK queries',
      },
      tags: [
        {
          name: 'System',
          description: 'System health and monitoring endpoints',
        },
        {
          name: 'Monitoring',
          description: 'Service monitoring and status endpoints',
        },
        {
          name: 'Memory',
          description: 'Message storage and retrieval operations',
        },
        {
          name: 'Streaming',
          description:
            'Real-time streaming operations for OpenAI-format chunks',
        },
      ],
    },
    apis:
      process.env.NODE_ENV === 'production'
        ? ['./dist/**/*.js']
        : ['./src/**/*.ts'],
  };

  const specs = swaggerJsdoc(options);

  app.get('/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'ARK Memory API Docs',
    })
  );

  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  logger.info(
    {url: `http://${displayHost}:${port}/api-docs`},
    'API documentation available'
  );
  logger.info(
    {url: `http://${displayHost}:${port}/openapi.json`},
    'OpenAPI spec available'
  );
}
