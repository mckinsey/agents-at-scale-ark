import swaggerJsdoc from 'swagger-jsdoc';
import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || '8080';

export function setupSwagger(app: Express, version: string): void {
  const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ARK Broker API',
      version,
      description: 'Memory and streaming service for ARK queries',
    },
    // No servers specified - Swagger UI will use relative URLs
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
        description: 'Real-time streaming operations for OpenAI-format chunks',
      },
    ],
  },
  apis: process.env.NODE_ENV === 'production'
    ? [
        './dist/routes/memory.js',
        './dist/routes/stream.js',
        './dist/routes/traces.js',
        './dist/routes/events.js',
        './dist/routes/sessions.js',
        './dist/routes/otlp.js',
      ]
    : [
        './src/routes/memory.ts',
        './src/routes/stream.ts',
        './src/routes/traces.ts',
        './src/routes/events.ts',
        './src/routes/sessions.ts',
        './src/routes/otlp.ts',
      ],
  };

  const specs = swaggerJsdoc(options);

  // Serve OpenAPI spec as JSON
  app.get('/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  // Serve Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'ARK Memory API Docs',
  }));

  console.log(`API documentation available at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api-docs`);
  console.log(`OpenAPI spec available at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/openapi.json`);
}
