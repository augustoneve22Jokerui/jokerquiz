import { Server } from 'socket.io';
import { env } from './environment.js';
import { sessionMiddleware } from './session.js';

let ioInstance = null;

/**
 * Opções de configuração para o servidor Socket.IO.
 * Assegura compatibilidade com reverse proxies do Render,
 * gestão eficiente de pulsação (heartbeat) e restrição de CORS.
 */
export const socketOptions = {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        env.APP_URL,
        env.SECURITY.corsOrigin,
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ];
      if (allowedOrigins.includes(origin) || !env.IS_PRODUCTION) {
        return callback(null, true);
      }
      return callback(new Error('Origem de WebSocket não permitida pelo CORS.'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // Limite de 1MB por payload de WebSocket
  transports: ['websocket', 'polling'],
};

/**
 * Inicializa o servidor Socket.IO atrelando-o ao servidor HTTP nativo
 * e vinculando o middleware de sessão express para autenticação no handshake.
 * 
 * @param {import('http').Server} httpServer - Servidor HTTP Node.js
 * @returns {Server} Instância configurada do Socket.IO
 */
export const initSocketServer = (httpServer) => {
  if (ioInstance) {
    return ioInstance;
  }

  const io = new Server(httpServer, socketOptions);

  // Partilha a sessão do Express com a camada de transporte do Socket.IO (engine.io)
  io.engine.use(sessionMiddleware);

  ioInstance = io;
  return ioInstance;
};

/**
 * Retorna a instância ativa do Socket.IO para emissão de eventos em serviços ou controladores.
 * 
 * @returns {Server}
 */
export const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.IO ainda não foi inicializado. Chame initSocketServer(httpServer) primeiro.');
  }
  return ioInstance;
};

export default {
  socketOptions,
  initSocketServer,
  getIO,
};