import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool, closePool } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEEDS_DIR = path.join(__dirname, 'seeds');

/**
 * Cria a tabela de controlo de versionamento de seeds se não existir.
 * 
 * @param {import('pg').PoolClient} client
 */
const ensureSeedsTable = async (client) => {
  const query = `
    CREATE TABLE IF NOT EXISTS schema_seeds (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await client.query(query);
};

/**
 * Executa todos os ficheiros de povoamento inicial (seeds) ordenados alfanumericamente.
 * Cada seed é executado de forma transacional e idempotente, garantindo integridade.
 */
export const runSeeds = async () => {
  console.log('[SEED] A verificar ficheiros de povoamento de dados...');
  const client = await pool.connect();

  try {
    // 1. Assegura a tabela de controlo de execução de seeds
    await ensureSeedsTable(client);

    // 2. Consulta os seeds já aplicados
    const { rows: executedRows } = await client.query(
      'SELECT name FROM schema_seeds ORDER BY id ASC;'
    );
    const executedSeeds = new Set(executedRows.map((row) => row.name));

    // 3. Lê todos os ficheiros .js dentro de src/database/seeds/
    let files = [];
    try {
      files = await fs.readdir(SEEDS_DIR);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('[SEED] Directório de seeds ainda não contém ficheiros.');
        return;
      }
      throw err;
    }

    const seedFiles = files
      .filter((file) => file.endsWith('.js'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (seedFiles.length === 0) {
      console.log('[SEED] Nenhum ficheiro de seed localizado.');
      return;
    }

    let appliedCount = 0;

    for (const file of seedFiles) {
      if (executedSeeds.has(file)) {
        continue;
      }

      console.log(`[SEED] A executar rotina de seed: ${file}...`);
      const filePath = path.join(SEEDS_DIR, file);
      const fileUrl = pathToFileURL(filePath).href;

      // Importação dinâmica do módulo de seed (ES Modules nativo)
      const seedModule = await import(fileUrl);
      const seedFn = seedModule.default || seedModule.runSeed;

      if (typeof seedFn !== 'function') {
        throw new Error(`O ficheiro de seed [${file}] deve exportar uma função default ou 'runSeed'.`);
      }

      const startTime = Date.now();

      // Execução transacional de cada seed
      try {
        await client.query('BEGIN');
        await seedFn(client);
        await client.query(
          'INSERT INTO schema_seeds (name) VALUES ($1);',
          [file]
        );
        await client.query('COMMIT');

        const duration = Date.now() - startTime;
        console.log(`[SEED] ✓ Seed concluído com sucesso: ${file} (${duration}ms)`);
        appliedCount++;
      } catch (seedError) {
        await client.query('ROLLBACK');
        console.error(`[SEED CRITICAL] Falha ao executar seed [${file}]:`, seedError.message);
        throw seedError;
      }
    }

    if (appliedCount === 0) {
      console.log('[SEED] A base de dados já possui todos os seeds obrigatórios aplicados.');
    } else {
      console.log(`[SEED] Total de rotinas de seed concluídas nesta execução: ${appliedCount}`);
    }
  } catch (error) {
    console.error('[SEED FATAL] Processo de seed abortado:', error.message);
    process.exitCode = 1;
    throw error;
  } finally {
    client.release();
    if (process.argv[1] === fileURLToPath(import.meta.url)) {
      await closePool();
    }
  }
};

// Execução directa via `node src/database/seed.js` ou `npm run db:seed`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeeds()
    .then(() => {
      console.log('[SEED] Processo de povoamento inicial finalizado com sucesso.');
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

export default runSeeds;