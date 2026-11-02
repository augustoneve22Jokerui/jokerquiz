import { env } from './environment.js';

/**
 * Configuração centralizada para o pool de conexões PostgreSQL (Neon Database).
 * Garante SSL adequado, gestão de timeouts e limitação estrita do tamanho do pool
 * para operar com estabilidade tanto em desenvolvimento como nos ambientes de produção do Render.
 */
export const dbConfig = {
  connectionString: env.DB.url,
  max: env.DB.poolMax,
  idleTimeoutMillis: env.DB.idleTimeoutMillis,
  connectionTimeoutMillis: env.DB.connectionTimeoutMillis,
  ssl: env.DB.ssl
    ? {
        rejectUnauthorized: false,
      }
    : false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

/**
 * Opções de configuração para o armazenamento de sessões (connect-pg-simple).
 */
export const sessionStoreConfig = {
  tableName: 'user_sessions',
  createTableIfMissing: false, // Gerido explicitamente pelas migrações SQL
  pruneSessionInterval: 60 * 15, // Limpeza de sessões expiradas a cada 15 minutos
};

export default dbConfig;