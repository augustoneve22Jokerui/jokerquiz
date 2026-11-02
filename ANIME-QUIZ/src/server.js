import http from 'node:http';
import app from './app.js';
import { env } from './config/environment.js';
import { initSocketServer } from './config/socket.js';
import { testConnection, closePool } from './database/connection.js';

/**
 * Criação do servidor HTTP nativo acoplado à aplicação Express 5.
 */
const httpServer = http.createServer(app);

/**
 * Inicialização e ligação do ecossistema de WebSocket (Socket.IO).
 */
const io = initSocketServer(httpServer);

/**
 * Arranca o servidor e valida a conectividade da infraestrutura.
 */
const startServer = async () => {
  try {
    console.log(`[BOOT] A inicializar ${env.APP_NAME} em modo [${env.NODE_ENV.toUpperCase()}]...`);

    // 1. Testa a conectividade com a base de dados PostgreSQL Neon
    const isDbConnected = await testConnection();
    if (!isDbConnected) {
      console.error('[BOOT CRITICAL] Não foi possível estabelecer ligação ao PostgreSQL Neon. Verifique DATABASE_URL.');
      process.exit(1);
    }

    // 2. Inicia a escuta na porta especificada pelo Render ou ficheiro de ambiente
    httpServer.listen(env.PORT, () => {
      console.log(`[SERVER] Servidor operacional e a escutar em: ${env.APP_URL}`);
      console.log(`[SERVER] Porta activa: ${env.PORT}`);
      console.log(`[WEBSOCKET] Socket.IO anexado e preparado para conexões em tempo real.`);
    });
  } catch (error) {
    console.error('[BOOT CRITICAL] Falha catastrófica ao arrancar o servidor:', error);
    process.exit(1);
  }
};

/**
 * Rotina para encerramento gracioso (Graceful Shutdown) da infraestrutura no Render.
 * Garante que requisições em trânsito terminem, sockets sejam desfeitas
 * e o pool do PostgreSQL seja drenado sem corrupção ou fugas.
 * 
 * @param {string} signal - Sinal recebido do sistema operacional (SIGTERM / SIGINT)
 */
const gracefulShutdown = async (signal) => {
  console.log(`\n[SHUTDOWN] Sinal ${signal} recebido. A iniciar encerramento gracioso...`);

  // Define um tempo limite máximo para forçar encerramento caso conexões fiquem penduradas
  const forceExitTimeout = setTimeout(() => {
    console.error('[SHUTDOWN] Tempo limite de encerramento excedido. Forçando finalização.');
    process.exit(1);
  }, 10000);

  // Impede que o timer mantenha o event loop ativo se tudo fechar antes
  forceExitTimeout.unref();

  try {
    // 1. Encerra aceitação de novos pedidos no Socket.IO
    if (io) {
      console.log('[SHUTDOWN] A fechar conexões activas do Socket.IO...');
      await new Promise((resolve) => io.close(resolve));
    }

    // 2. Pára o servidor HTTP
    console.log('[SHUTDOWN] A fechar servidor HTTP...');
    await new Promise((resolve, reject) => {
      httpServer.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // 3. Liberta o pool de conexões do PostgreSQL
    console.log('[SHUTDOWN] A drenar pool de conexões com o PostgreSQL...');
    await closePool();

    console.log('[SHUTDOWN] Encerramento gracioso concluído com sucesso.');
    process.exit(0);
  } catch (error) {
    console.error('[SHUTDOWN ERROR] Erro durante o processo de encerramento:', error);
    process.exit(1);
  }
};

// Tratamento de sinais operacionais de paragem (Render deploys, Ctrl+C local)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Captura de falhas críticas não tratadas
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION] Erro crítico não capturado:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION] Promessa rejeitada sem tratamento:', { promise, reason });
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Executa arranque
startServer();