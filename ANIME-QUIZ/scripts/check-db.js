import { pool, closePool } from '../src/database/connection.js';
import { env } from '../src/config/environment.js';

/**
 * Script de diagnóstico de infraestrutura e conectividade com a base de dados PostgreSQL Neon.
 * Executado via `npm run db:check` ou `node scripts/check-db.js`.
 */
const runDatabaseCheck = async () => {
  console.log('================================================================================');
  console.log(`[DB CHECK] A verificar conectividade com o PostgreSQL Neon (${env.APP_NAME})...`);
  console.log('================================================================================');

  const startTime = Date.now();
  let client;

  try {
    // 1. Aquisição de conexão do pool
    client = await pool.connect();
    const connectDuration = Date.now() - startTime;
    console.log(`[CONEXÃO] ✓ Ligação ao pool de conexões estabelecida em ${connectDuration}ms.`);

    // 2. Consulta de metadados de versão e fuso horário
    const serverInfoQuery = `
      SELECT 
        version() AS pg_version,
        current_database() AS db_name,
        current_user AS db_user,
        NOW() AS server_timestamp,
        current_setting('TIMEZONE') AS db_timezone;
    `;
    const { rows: infoRows } = await client.query(serverInfoQuery);
    const info = infoRows[0];

    console.log(`[SERVIDOR] PostgreSQL Version: ${info.pg_version.split(',')[0]}`);
    console.log(`[SERVIDOR] Base de Dados Activa: ${info.db_name}`);
    console.log(`[SERVIDOR] Utilizador Autenticado: ${info.db_user}`);
    console.log(`[SERVIDOR] Timestamp do Servidor: ${info.server_timestamp}`);
    console.log(`[SERVIDOR] Timezone Configurada: ${info.db_timezone}`);

    // 3. Inspeção das tabelas relacionais existentes no schema public
    const tablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC;
    `;
    const { rows: tableRows } = await client.query(tablesQuery);
    const tableNames = tableRows.map((t) => t.table_name);

    console.log('--------------------------------------------------------------------------------');
    console.log(`[TABELAS DETECTADAS] Total no schema público: ${tableNames.length}`);
    tableNames.forEach((name, idx) => {
      console.log(`  ${String(idx + 1).padStart(2, ' ')}. ${name}`);
    });

    // 4. Rastreio de migrações e seeds aplicados
    if (tableNames.includes('schema_migrations')) {
      const { rows: migRows } = await client.query('SELECT COUNT(*) AS total FROM schema_migrations;');
      console.log(`[MIGRAÇÕES] Migrações SQL executadas: ${migRows[0].total}`);
    }

    if (tableNames.includes('schema_seeds')) {
      const { rows: seedRows } = await client.query('SELECT COUNT(*) AS total FROM schema_seeds;');
      console.log(`[SEEDS] Rotinas de povoamento concluídas: ${seedRows[0].total}`);
    }

    // 5. Estatísticas operacionais do pool de conexões
    console.log('--------------------------------------------------------------------------------');
    console.log(`[POOL STATS] Clientes Totais: ${pool.totalCount} | Ociosos: ${pool.idleCount} | À Espera: ${pool.waitingCount}`);
    console.log('================================================================================');
    console.log(`[DIAGNÓSTICO] ✓ Conexão com o PostgreSQL Neon validada e 100% operacional.`);
    console.log('================================================================================');

    process.exitCode = 0;
  } catch (error) {
    console.error('================================================================================');
    console.error('[ERRO CRÍTICO] Falha no teste de conectividade com a base de dados:');
    console.error(error.message);
    if (error.stack) console.error(error.stack);
    console.error('================================================================================');
    process.exitCode = 1;
  } finally {
    if (client) {
      client.release();
    }
    await closePool();
  }
};

runDatabaseCheck();