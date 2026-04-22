import { Router } from 'express';

const docsRouter = Router();

const BASE_URL = process.env.PUBLIC_API_BASE_URL || '';

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Udar Edge API',
    version: '1.0.0',
    description: `API pública de Udar Edge para integrar datos de tu concesionario con sistemas externos (n8n, Zapier, webs corporativas, etc.).

## Autenticación

Todas las rutas bajo \`/api/v1/\` requieren un **API Token** de tipo Bearer.

\`\`\`
Authorization: Bearer udar_sk_xxxxxxxxxxxxxxxx
\`\`\`

Los tokens se generan desde **Ajustes → API Tokens** en la aplicación.

## Rate Limiting

- **120 peticiones/minuto** por IP.
- Las respuestas incluyen el header \`X-RateLimit-Remaining\`.

## Webhooks salientes

Configura URLs de destino en **Ajustes → Webhooks** para recibir eventos en tiempo real.  
Cada envío incluye la cabecera \`X-Udar-Signature\` con HMAC-SHA256 para verificar la autenticidad.
`,
    contact: {
      name: 'Soporte Udar Edge',
      email: 'soporte@udar.app',
    },
    license: {
      name: 'Propietario',
    },
  },
  servers: [
    {
      url: BASE_URL || 'https://tu-dominio.udar.app',
      description: 'Producción',
    },
    {
      url: 'https://api.udaredge.com',
      description: 'Desarrollo local',
    },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Token (udar_sk_...)',
        description: 'Token de API generado en Ajustes → API Tokens',
      },
    },
    schemas: {
      Meta: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 50 },
          pages: { type: 'integer', example: 1 },
        },
      },
      Error: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Descripción del error' },
        },
      },
      Vehicle: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: 'v_abc123' },
          user_id: { type: 'string', example: 'usr_xyz' },
          brand: { type: 'string', example: 'Toyota' },
          model: { type: 'string', example: 'Corolla' },
          year: { type: 'integer', example: 2022 },
          color: { type: 'string', example: 'Blanco Perlado' },
          mileage: { type: 'integer', example: 15000 },
          price: { type: 'number', example: 18500 },
          status: {
            type: 'string',
            enum: ['available', 'reserved', 'sold'],
            example: 'available',
          },
          fuel: { type: 'string', example: 'Gasolina' },
          transmission: { type: 'string', example: 'Automático' },
          plate: { type: 'string', example: '1234-ABC' },
          vin: { type: 'string', example: 'WBA4J5C59JBF99999' },
          description: { type: 'string' },
          images: { type: 'array', items: { type: 'string', format: 'uri' } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      VehicleInput: {
        type: 'object',
        required: ['brand', 'model'],
        properties: {
          brand: { type: 'string', example: 'Toyota' },
          model: { type: 'string', example: 'Corolla' },
          year: { type: 'integer', example: 2022 },
          color: { type: 'string', example: 'Blanco Perlado' },
          mileage: { type: 'integer', example: 15000 },
          price: { type: 'number', example: 18500 },
          status: { type: 'string', enum: ['available', 'reserved', 'sold'], default: 'available' },
          fuel: { type: 'string', example: 'Gasolina' },
          transmission: { type: 'string', example: 'Automático' },
          plate: { type: 'string', example: '1234-ABC' },
          vin: { type: 'string' },
          description: { type: 'string' },
        },
      },
      Lead: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: 'lead_abc123' },
          user_id: { type: 'string' },
          type: { type: 'string', example: 'lead' },
          name: { type: 'string', example: 'Juan García' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', example: '+34 612 345 678' },
          source: {
            type: 'string',
            example: 'web',
            description: 'Canal de captación: web, referido, showroom, llamada, etc.',
          },
          status: {
            type: 'string',
            enum: ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'],
            example: 'new',
          },
          vehicleId: { type: 'string', description: 'ID del vehículo de interés' },
          notes: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      LeadInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'Juan García' },
          email: { type: 'string', format: 'email', example: 'juan@email.com' },
          phone: { type: 'string', example: '+34 612 345 678' },
          source: { type: 'string', example: 'web' },
          status: {
            type: 'string',
            enum: ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'],
            default: 'new',
          },
          vehicleId: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      Sale: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          user_id: { type: 'string' },
          vehicleId: { type: 'string' },
          clientId: { type: 'string' },
          totalAmount: { type: 'number', example: 18500 },
          status: {
            type: 'string',
            enum: ['pending', 'completed', 'cancelled'],
            example: 'completed',
          },
          paymentMethod: { type: 'string', example: 'financiación' },
          saleDate: { type: 'string', format: 'date-time' },
          notes: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      SaleInput: {
        type: 'object',
        required: ['vehicleId', 'totalAmount'],
        properties: {
          vehicleId: { type: 'string', example: 'v_abc123' },
          clientId: { type: 'string', example: 'client_xyz' },
          totalAmount: { type: 'number', example: 18500 },
          status: {
            type: 'string',
            enum: ['pending', 'completed', 'cancelled'],
            default: 'pending',
          },
          paymentMethod: { type: 'string', example: 'financiación' },
          saleDate: { type: 'string', format: 'date-time' },
          notes: { type: 'string' },
        },
      },
      Client: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          user_id: { type: 'string' },
          name: { type: 'string', example: 'Ana López' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          dni: { type: 'string', example: '12345678A' },
          address: { type: 'string' },
          city: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ClientInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'Ana López' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          dni: { type: 'string' },
          address: { type: 'string' },
          city: { type: 'string' },
        },
      },
      KPIs: {
        type: 'object',
        properties: {
          stockCount: { type: 'integer', description: 'Vehículos disponibles en stock', example: 24 },
          reservedCount: { type: 'integer', description: 'Vehículos reservados', example: 3 },
          totalVehicles: { type: 'integer', description: 'Total de vehículos activos', example: 30 },
          soldThisMonth: { type: 'integer', description: 'Vendidos en el mes actual', example: 7 },
          salesVolume: { type: 'number', description: 'Volumen de ventas del mes (€)', example: 129500 },
          oportunidades: { type: 'integer', description: 'Leads activos en pipeline', example: 12 },
          cobrosPendientes: { type: 'number', description: 'Importe pendiente de cobro (€)', example: 8400 },
        },
      },
      Webhook: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'wh_abc123' },
          userId: { type: 'string' },
          name: { type: 'string', example: 'Notificar n8n leads' },
          url: { type: 'string', format: 'uri', example: 'https://n8n.mi-empresa.com/webhook/udar' },
          events: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'lead.created',
                'lead.updated',
                'sale.created',
                'vehicle.created',
                'vehicle.updated',
                'client.created',
              ],
            },
            example: ['lead.created', 'sale.created'],
          },
          secret: {
            type: 'string',
            description: 'Secreto HMAC para verificar la firma X-Udar-Signature',
          },
          active: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          lastTriggeredAt: { type: 'string', format: 'date-time', nullable: true },
          lastStatus: { type: 'integer', description: 'Código HTTP del último envío', example: 200 },
        },
      },
      WebhookInput: {
        type: 'object',
        required: ['name', 'url', 'userId'],
        properties: {
          name: { type: 'string', example: 'Notificar n8n leads' },
          url: { type: 'string', format: 'uri', example: 'https://n8n.mi-empresa.com/webhook/udar' },
          userId: { type: 'string' },
          events: {
            type: 'array',
            items: { type: 'string' },
            example: ['lead.created', 'sale.created'],
          },
          active: { type: 'boolean', default: true },
        },
      },
    },
    parameters: {
      page: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', default: 1, minimum: 1 },
        description: 'Número de página',
      },
      limit: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
        description: 'Resultados por página (máx. 100)',
      },
    },
    responses: {
      Unauthorized: {
        description: 'Token de API inválido o ausente',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { ok: false, error: 'Token de API requerido. Usa Authorization: Bearer <token>' },
          },
        },
      },
      NotFound: {
        description: 'Recurso no encontrado',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      ServerError: {
        description: 'Error interno del servidor',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
  },
  paths: {
    '/api/v1': {
      get: {
        tags: ['Información'],
        summary: 'Info de la API',
        description: 'Devuelve metainformación de la API: versión, userId autenticado, permisos y listado de endpoints.',
        operationId: 'getApiInfo',
        responses: {
          200: {
            description: 'Información de la API',
            content: {
              'application/json': {
                example: {
                  ok: true,
                  name: 'Udar Edge API',
                  version: '1',
                  userId: 'usr_abc123',
                  permissions: ['vehicles:read', 'leads:write'],
                  endpoints: {
                    vehicles: '/api/v1/vehicles',
                    sales: '/api/v1/sales',
                    clients: '/api/v1/clients',
                    pipeline: '/api/v1/pipeline',
                    documents: '/api/v1/documents',
                    finance: '/api/v1/finance',
                    team: '/api/v1/team',
                    calls: '/api/v1/calls',
                    dashboard: '/api/v1/dashboard/kpis',
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/v1/vehicles': {
      get: {
        tags: ['Vehículos'],
        summary: 'Listar vehículos',
        description: 'Devuelve todos los vehículos del concesionario paginados. Filtrables por estado.',
        operationId: 'listVehicles',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
        ],
        responses: {
          200: {
            description: 'Lista de vehículos',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Vehicle' } },
                    meta: { $ref: '#/components/schemas/Meta' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          500: { $ref: '#/components/responses/ServerError' },
        },
      },
      post: {
        tags: ['Vehículos'],
        summary: 'Crear vehículo',
        operationId: 'createVehicle',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VehicleInput' },
            },
          },
        },
        responses: {
          201: {
            description: 'Vehículo creado',
            content: {
              'application/json': {
                example: { ok: true, id: 'v_newid123', rev: '1-abc' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          500: { $ref: '#/components/responses/ServerError' },
        },
      },
    },

    '/api/v1/vehicles/{id}': {
      get: {
        tags: ['Vehículos'],
        summary: 'Obtener vehículo por ID',
        operationId: 'getVehicle',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Vehículo encontrado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/Vehicle' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Vehículos'],
        summary: 'Actualizar vehículo',
        operationId: 'updateVehicle',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VehicleInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'Vehículo actualizado',
            content: {
              'application/json': {
                example: { ok: true, id: 'v_abc123', rev: '2-def' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/v1/pipeline': {
      get: {
        tags: ['Pipeline (Leads)'],
        summary: 'Listar leads del pipeline',
        operationId: 'listLeads',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
        ],
        responses: {
          200: {
            description: 'Lista de leads',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Lead' } },
                    meta: { $ref: '#/components/schemas/Meta' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Pipeline (Leads)'],
        summary: 'Crear lead',
        description: 'Crea un nuevo lead en el pipeline. Dispara el webhook `lead.created` si está configurado.',
        operationId: 'createLead',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LeadInput' },
            },
          },
        },
        responses: {
          201: {
            description: 'Lead creado',
            content: {
              'application/json': {
                example: { ok: true, id: 'lead_newid', rev: '1-abc' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/v1/pipeline/{id}': {
      get: {
        tags: ['Pipeline (Leads)'],
        summary: 'Obtener lead por ID',
        operationId: 'getLead',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Lead encontrado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/Lead' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Pipeline (Leads)'],
        summary: 'Actualizar lead',
        description: 'Actualiza el estado u otros campos de un lead. Dispara el webhook `lead.updated`.',
        operationId: 'updateLead',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LeadInput' },
            },
          },
        },
        responses: {
          200: { description: 'Lead actualizado' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/v1/sales': {
      get: {
        tags: ['Ventas'],
        summary: 'Listar ventas',
        operationId: 'listSales',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
        ],
        responses: {
          200: {
            description: 'Lista de ventas',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Sale' } },
                    meta: { $ref: '#/components/schemas/Meta' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Ventas'],
        summary: 'Registrar venta',
        description: 'Crea un registro de venta. Dispara el webhook `sale.created`.',
        operationId: 'createSale',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SaleInput' },
            },
          },
        },
        responses: {
          201: { description: 'Venta creada' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/v1/sales/{id}': {
      get: {
        tags: ['Ventas'],
        summary: 'Obtener venta por ID',
        operationId: 'getSale',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Venta encontrada' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/v1/clients': {
      get: {
        tags: ['Clientes'],
        summary: 'Listar clientes',
        operationId: 'listClients',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
        ],
        responses: {
          200: {
            description: 'Lista de clientes',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Client' } },
                    meta: { $ref: '#/components/schemas/Meta' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Clientes'],
        summary: 'Crear cliente',
        description: 'Crea un nuevo cliente. Dispara el webhook `client.created`.',
        operationId: 'createClient',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ClientInput' },
            },
          },
        },
        responses: {
          201: { description: 'Cliente creado' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/v1/clients/{id}': {
      get: {
        tags: ['Clientes'],
        summary: 'Obtener cliente por ID',
        operationId: 'getClient',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Cliente encontrado' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/v1/finance': {
      get: {
        tags: ['Finanzas'],
        summary: 'Listado de movimientos financieros',
        description: 'Devuelve ingresos, gastos y el balance neto del período.',
        operationId: 'listFinance',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
        ],
        responses: {
          200: {
            description: 'Movimientos y resumen financiero',
            content: {
              'application/json': {
                example: {
                  ok: true,
                  data: [],
                  summary: { totalIncome: 45000, totalExpense: 12000, balance: 33000 },
                  meta: { total: 20, page: 1, limit: 50, pages: 1 },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/v1/documents': {
      get: {
        tags: ['Documentos'],
        summary: 'Listar documentos',
        operationId: 'listDocuments',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
        ],
        responses: {
          200: { description: 'Lista de documentos' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/v1/documents/{id}': {
      get: {
        tags: ['Documentos'],
        summary: 'Obtener documento por ID',
        operationId: 'getDocument',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Documento encontrado' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/v1/team': {
      get: {
        tags: ['Equipo'],
        summary: 'Listar miembros del equipo',
        description: 'Devuelve los usuarios (vendedores, administradores) del concesionario. Los campos sensibles como contraseñas son omitidos.',
        operationId: 'listTeam',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
        ],
        responses: {
          200: { description: 'Lista de miembros del equipo' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/v1/calls': {
      get: {
        tags: ['Llamadas IA'],
        summary: 'Listar llamadas transcritas',
        operationId: 'listCalls',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
        ],
        responses: {
          200: { description: 'Lista de llamadas con transcripción y resumen IA' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/v1/calls/{id}': {
      get: {
        tags: ['Llamadas IA'],
        summary: 'Obtener llamada por ID',
        operationId: 'getCall',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Llamada encontrada' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/v1/dashboard/kpis': {
      get: {
        tags: ['Dashboard'],
        summary: 'KPIs del concesionario',
        description: 'Devuelve los indicadores clave de rendimiento: stock disponible, ventas del mes, volumen de facturación, leads activos, etc.',
        operationId: 'getDashboardKpis',
        responses: {
          200: {
            description: 'KPIs actualizados',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/KPIs' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/webhooks': {
      get: {
        tags: ['Webhooks'],
        summary: 'Listar webhooks configurados',
        description: 'Devuelve los webhooks salientes del usuario. Requiere autenticación JWT.',
        operationId: 'listWebhooks',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'userId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'ID del usuario propietario',
          },
        ],
        responses: {
          200: {
            description: 'Lista de webhooks',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    webhooks: { type: 'array', items: { $ref: '#/components/schemas/Webhook' } },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Webhooks'],
        summary: 'Crear webhook',
        description: 'Registra una nueva URL de webhook para recibir eventos de Udar Edge.',
        operationId: 'createWebhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebhookInput' },
            },
          },
        },
        responses: {
          201: {
            description: 'Webhook creado. La respuesta incluye el `secret` HMAC (solo visible una vez).',
            content: {
              'application/json': {
                example: {
                  ok: true,
                  webhook: {
                    id: 'wh_abc123',
                    secret: 'whsec_xxxxxxxxxxxxxxxx',
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/webhooks/{id}': {
      put: {
        tags: ['Webhooks'],
        summary: 'Actualizar webhook',
        operationId: 'updateWebhook',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebhookInput' },
            },
          },
        },
        responses: {
          200: { description: 'Webhook actualizado' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Webhooks'],
        summary: 'Eliminar webhook',
        operationId: 'deleteWebhook',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Webhook eliminado' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/webhooks/{id}/test': {
      post: {
        tags: ['Webhooks'],
        summary: 'Probar webhook',
        description: 'Envía un evento de prueba (`ping`) a la URL configurada para verificar la conectividad.',
        operationId: 'testWebhook',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Resultado del test',
            content: {
              'application/json': {
                example: {
                  ok: true,
                  status: 200,
                  durationMs: 142,
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
  tags: [
    { name: 'Información', description: 'Metainformación de la API' },
    { name: 'Vehículos', description: 'Gestión del catálogo de vehículos y stock' },
    { name: 'Pipeline (Leads)', description: 'CRM pipeline de oportunidades de venta' },
    { name: 'Ventas', description: 'Registro de ventas cerradas' },
    { name: 'Clientes', description: 'Base de datos de clientes' },
    { name: 'Finanzas', description: 'Movimientos financieros y balance' },
    { name: 'Documentos', description: 'Contratos y documentación adjunta' },
    { name: 'Equipo', description: 'Usuarios y vendedores del concesionario' },
    { name: 'Llamadas IA', description: 'Llamadas transcritas y resumidas por IA' },
    { name: 'Dashboard', description: 'KPIs y métricas de rendimiento' },
    { name: 'Webhooks', description: 'Webhooks salientes para integraciones (n8n, Zapier, etc.)' },
  ],
};

docsRouter.get('/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

docsRouter.get('/', (req, res) => {
  const specUrl = `${BASE_URL}/api/docs/openapi.json`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Udar Edge API — Documentación</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚗</text></svg>" />
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; }
    #swagger-ui { max-width: 1280px; margin: 0 auto; }

    .swagger-ui .topbar { background: #0f1117; border-bottom: 1px solid #1e2130; padding: 12px 24px; }
    .swagger-ui .topbar .topbar-wrapper { gap: 16px; }
    .swagger-ui .topbar-wrapper img { display: none; }
    .swagger-ui .topbar-wrapper::before {
      content: '🚗 Udar Edge API';
      color: #fff;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }

    .swagger-ui .info { background: #161b27; border: 1px solid #1e2130; border-radius: 12px; margin: 24px; padding: 32px; }
    .swagger-ui .info .title { color: #e8eaf0; font-size: 28px; }
    .swagger-ui .info p, .swagger-ui .info li { color: #8b92a5; }
    .swagger-ui .info code { background: #1e2130; color: #6ee7b7; border-radius: 4px; padding: 2px 6px; }
    .swagger-ui .info pre { background: #0d1117; border: 1px solid #1e2130; border-radius: 8px; padding: 16px; }
    .swagger-ui .info h2, .swagger-ui .info h3 { color: #c9d1d9; }

    .swagger-ui .scheme-container { background: #161b27; border: none; box-shadow: none; padding: 16px 24px; }
    .swagger-ui select { background: #1e2130; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; }

    .swagger-ui .opblock-tag { border-bottom: 1px solid #1e2130; color: #c9d1d9; font-size: 16px; }
    .swagger-ui .opblock-tag:hover { background: #161b27; }

    .swagger-ui .opblock { border-radius: 8px; margin: 6px 0; border: none; box-shadow: none; }
    .swagger-ui .opblock.opblock-get { background: #0d1f36; border-left: 3px solid #388bfd; }
    .swagger-ui .opblock.opblock-post { background: #0d2818; border-left: 3px solid #2da44e; }
    .swagger-ui .opblock.opblock-put { background: #2c1e04; border-left: 3px solid #d29922; }
    .swagger-ui .opblock.opblock-delete { background: #2c0e0e; border-left: 3px solid #f85149; }
    .swagger-ui .opblock-summary-description { color: #8b92a5; }
    .swagger-ui .opblock-summary-path { color: #c9d1d9 !important; }
    .swagger-ui .opblock-body { background: #0d1117; border-radius: 0 0 8px 8px; }
    .swagger-ui .opblock-description-wrapper p { color: #8b92a5; }

    .swagger-ui .btn.authorize { background: #1f6feb; color: #fff; border: none; border-radius: 6px; font-weight: 600; }
    .swagger-ui .btn.authorize svg { fill: #fff; }
    .swagger-ui .btn { border-radius: 6px; }

    .swagger-ui .response-col_status { color: #6ee7b7; }
    .swagger-ui table thead tr th { color: #8b92a5; border-color: #1e2130; }
    .swagger-ui table tbody tr td { border-color: #1e2130; color: #c9d1d9; }

    .swagger-ui .model-title { color: #c9d1d9; }
    .swagger-ui section.models { background: #0d1117; border: 1px solid #1e2130; border-radius: 8px; }
    .swagger-ui section.models h4 { color: #c9d1d9; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${specUrl}',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 2,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
      tagsSorter: 'alpha',
    });
  </script>
</body>
</html>`);
});

export { docsRouter };
