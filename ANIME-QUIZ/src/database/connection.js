import pg from 'pg';
import { dbConfig } from '../config/database.js';

const { Pool } = pg;

/**
 * Instância única do pool de conexões com o PostgreSQL Neon.
 */
export const pool = new Pool(dbConfig);

// Listener para erros inesperados em clientes ociosos do pool
pool.on('error', (err) => {
  console.error('ERRO INESPERADO NO POOL POSTGRESQL:', err.message, err.stack);
});

/**
 * Executa uma consulta SQL parametrizada utilizando o pool de conexões.
 * 
 * @param {string} text - Comando SQL parametrizado ($1, $2, etc.)
 * @param {Array<any>} [params=[]] - Valores associados aos parâmetros
 * @returns {Promise<pg.QueryResult>}
 */
export const query = async (text, params = []) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 200) {
      console.warn(`[SLOW QUERY] (${duration}ms): ${text.replace(/\s+/g, ' ').trim()}`);
    }
    return res;
  } catch (error) {
    console.error('[DATABASE QUERY ERROR]:', {
      query: text.replace(/\s+/g, ' ').trim(),
      params,
      message: error.message,
    });
    throw error;
  }
};

/**
 * Obtém um cliente dedicado do pool para operações manuais ou multi-declarações.
 * O cliente DEVE ser liberado obrigatoriamente através de client.release().
 * 
 * @returns {Promise<pg.PoolClient>}
 */
export const getClient = async () => {
  const client = await pool.connect();
  return client;
};

/**
 * Executa uma operação transacional completa com isolamento e controlo de integridade.
 * Realiza BEGIN antes da execução e encarrega-se do COMMIT ou ROLLBACK automático em caso de erro,
 * garantindo sempre a libertação do cliente de volta para o pool.
 * 
 * @template T
 * @param {(client: pg.PoolClient) => Promise<T>} callback - Função contendo as instruções transacionais
 * @returns {Promise<T>}
 */
export const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[DATABASE ROLLBACK ERROR]:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Testa a conectividade com o banco de dados Neon no arranque do servidor.
 * 
 * @returns {Promise<boolean>}
 */
export const testConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW() AS current_time, current_database() AS database_name');
    console.log(`[DATABASE] Conexão estabelecida com sucesso: ${res.rows[0].database_name} às ${res.rows[0].current_time}`);
    return true;
  } catch (error) {
    console.error('[DATABASE] Falha crítica ao conectar com o PostgreSQL Neon:', error.message);
    return false;
  }
};

/**
 * Encerra o pool de conexões de forma graciosa durante o encerramento do processo.
 * 
 * @returns {Promise<void>}
 */
export const closePool = async () => {
  try {
    await pool.end();
    console.log('[DATABASE] Pool de conexões PostgreSQL encerrado com sucesso.');
  } catch (error) {
    console.error('[DATABASE] Erro ao encerrar o pool PostgreSQL:', error.message);
  }
};

export default {
  pool,
  query,
  getClient,
  withTransaction,
  testConnection,
  closePool,
};