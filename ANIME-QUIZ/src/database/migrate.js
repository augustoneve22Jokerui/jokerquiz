import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Cria a tabela de controlo de versionamento de migrações se não existir.
 * 
 * @param {import('pg').PoolClient} client
 */
const ensureMigrationsTable = async (client) => {
  const query = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await client.query(query);
};

/**
 * Executa todas as migrações SQL pendentes em ordem alfanumérica estrita.
 * Cada ficheiro é executado dentro da sua própria transação atómica (BEGIN/COMMIT).
 * Em caso de falha, ocorre ROLLBACK imediato da migração com erro e o processo é abortado.
 */
export const runMigrations = async () => {
  console.log('[MIGRATE] A verificar integridade e migrações pendentes...');
  const client = await pool.connect();

  try {
    // 1. Assegura a tabela de rastreio de migrações
    await ensureMigrationsTable(client);

    // 2. Consulta as migrações já executadas anteriormente
    const { rows: executedRows } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY id ASC;'
    );
    const executedVersions = new Set(executedRows.map((row) => row.version));

    // 3. Lê todos os ficheiros .sql do directório migrations
    const files = await fs.readdir(MIGRATIONS_DIR);
    const sqlFiles = files
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (sqlFiles.length === 0) {
      console.log('[MIGRATE] Nenhum ficheiro de migração encontrado.');
      return;
    }

    let appliedCount = 0;

    for (const file of sqlFiles) {
      if (executedVersions.has(file)) {
        continue;
      }

      console.log(`[MIGRATE] A aplicar migração: ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = await fs.readFile(filePath, 'utf-8');

      const startTime = Date.now();

      // Executa cada ficheiro de migração dentro de uma transação isolada
      try {
        await client.query('BEGIN');
        await client.query(sqlContent);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1);',
          [file]
        );
        await client.query('COMMIT');

        const duration = Date.now() - startTime;
        console.log(`[MIGRATE] ✓ Concluída com sucesso: ${file} (${duration}ms)`);
        appliedCount++;
      } catch (migrationError) {
        await client.query('ROLLBACK');
        console.error(`[MIGRATE CRITICAL] Falha ao executar migração [${file}]:`, migrationError.message);
        throw migrationError;
      }
    }

    if (appliedCount === 0) {
      console.log('[MIGRATE] A base de dados já se encontra actualizada. Nenhuma migração pendente.');
    } else {
      console.log(`[MIGRATE] Total de migrações aplicadas nesta execução: ${appliedCount}`);
    }
  } catch (error) {
    console.error('[MIGRATE FATAL] Execução de migrações abortada:', error.message);
    process.exitCode = 1;
    throw error;
  } finally {
    client.release();
    // Encerra o pool caso o script tenha sido executado directamente pela linha de comandos
    if (process.argv[1] === fileURLToPath(import.meta.url)) {
      await closePool();
    }
  }
};

// Execução directa via `node src/database/migrate.js` ou `npm run db:migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('[MIGRATE] Processo de migração concluído.');
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

export default runMigrations;