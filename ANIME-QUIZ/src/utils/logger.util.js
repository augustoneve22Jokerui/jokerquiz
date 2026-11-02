import { env } from '../config/environment.js';

/**
 * Códigos ANSI para destaque visual de logs em ambiente de desenvolvimento local.
 */
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  info: '\x1b[36m', // Ciano
  warn: '\x1b[33m', // Amarelo
  error: '\x1b[31m', // Vermelho
  debug: '\x1b[35m', // Magenta
  audit: '\x1b[32m', // Verde
};

/**
 * Formata um payload de log de forma estruturada.
 * Em produção (Render), gera JSON estruturado legível por agregadores de logs.
 * Em desenvolvimento, formata com destaque colorido no terminal.
 * 
 * @param {'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'AUDIT'} level
 * @param {string} message
 * @param {any} [meta=null]
 */
const writeLog = (level, message, meta = null) => {
  const timestamp = new Date().toISOString();

  // Em produção: JSON estruturado em linha única
  if (env.IS_PRODUCTION) {
    const logEntry = {
      timestamp,
      level,
      message,
      ...(meta ? { meta } : {}),
    };

    if (level === 'ERROR') {
      console.error(JSON.stringify(logEntry));
    } else if (level === 'WARN') {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
    return;
  }

  // Em desenvolvimento: formatação visual no terminal
  const color = COLORS[level.toLowerCase()] || COLORS.reset;
  const prefix = `${COLORS.dim}[${timestamp}]${COLORS.reset} ${color}[${level}]${COLORS.reset}`;

  if (level === 'ERROR') {
    console.error(`${prefix} ${message}`);
    if (meta) {
      if (meta instanceof Error) {
        console.error(meta.stack);
      } else {
        console.error(meta);
      }
    }
  } else if (level === 'WARN') {
    console.warn(`${prefix} ${message}`);
    if (meta) console.warn(meta);
  } else {
    console.log(`${prefix} ${message}`);
    if (meta) console.log(meta);
  }
};

/**
 * Utilitário de registo estruturado para todo o ecossistema Anime Quiz.
 */
export const logger = {
  /**
   * Registo informativo de rotina operacional (conexões, partidas iniciadas, etc.).
   * 
   * @param {string} message
   * @param {any} [meta]
   */
  info: (message, meta) => writeLog('INFO', message, meta),

  /**
   * Registo de advertências e anomalias não críticas (rate limit atingido, query lenta).
   * 
   * @param {string} message
   * @param {any} [meta]
   */
  warn: (message, meta) => writeLog('WARN', message, meta),

  /**
   * Registo de erros de execução e falhas de infraestrutura.
   * 
   * @param {string} message
   * @param {Error | any} [errorOrMeta]
   */
  error: (message, errorOrMeta) => writeLog('ERROR', message, errorOrMeta),

  /**
   * Registo de depuração técnica detalhada (visível apenas em desenvolvimento).
   * 
   * @param {string} message
   * @param {any} [meta]
   */
  debug: (message, meta) => {
    if (env.IS_DEVELOPMENT) {
      writeLog('DEBUG', message, meta);
    }
  },

  /**
   * Registo especializado para acções administrativas e financeiras em Angola.
   * 
   * @param {string} action - Ex: 'APPROVE_PAYMENT', 'BAN_USER'
   * @param {Object} details - Dados auditados
   */
  audit: (action, details) => {
    writeLog('AUDIT', `AUDIT ACTION: ${action}`, details);
  },
};

export default logger;