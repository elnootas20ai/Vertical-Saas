import pino from 'pino';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRequestId } from '../middleware/correlationId.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');
const LOGS_DIR = path.resolve(__dirname, '../logs');

const isDev = NODE_ENV !== 'production';

const transport = pino.transport({
  targets: [
    ...(isDev
      ? [
          {
            target: 'pino-pretty',
            level: LOG_LEVEL,
            options: {
              colorize: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
              ignore: 'pid,hostname,env',
              messageFormat: '{msg}',
            },
            worker: { stdout: true },
          },
        ]
      : [
          {
            target: 'pino/file',
            level: LOG_LEVEL,
            options: { destination: 1 },
            worker: { stdout: true },
          },
        ]),
    {
      target: 'pino-roll',
      level: 'info',
      options: {
        file: path.join(LOGS_DIR, 'app.log'),
        frequency: 'daily',
        mkdir: true,
      },
    },
    {
      target: 'pino-roll',
      level: 'error',
      options: {
        file: path.join(LOGS_DIR, 'error.log'),
        frequency: 'daily',
        mkdir: true,
      },
    },
  ],
});

const logger = pino(
  {
    level: LOG_LEVEL,
    base: { env: NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport,
);

/**
 * I-07: Devuelve un child logger con el requestId activo inyectado automáticamente
 * desde AsyncLocalStorage. Si no hay contexto de request activo (schedulers, startup)
 * devuelve el logger base (o un child con sólo los bindings extra si se pasan).
 *
 * Uso recomendado en controllers y servicios:
 *   import { getLogger } from '../services/logger.js';
 *   const log = getLogger({ tag: 'SALES' });
 *   log.info({ userId }, 'Venta creada');  // → { requestId, tag, userId, msg }
 *
 * @param {object} [extraBindings] - Campos adicionales a mezclar en el child logger.
 */
export function getLogger(extraBindings) {
  const requestId = getRequestId();
  if (!requestId && !extraBindings) return logger;
  return logger.child({
    ...(requestId ? { requestId } : {}),
    ...(extraBindings ?? {}),
  });
}

export default logger;
