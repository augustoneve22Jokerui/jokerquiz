import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../database/connection.js';
import { env } from './environment.js';
import { sessionStoreConfig } from './database.js';

// Inicializa o construtor do store PostgreSQL para sessões
const PgSessionStore = connectPgSimple(session);

/**
 * Instância do repositório de persistência de sessões no PostgreSQL Neon.
 * Garante que sessões activas sobrevivam a reinícios do servidor e
 * permite partilha entre instâncias no Render e handshake de Socket.IO.
 */
export const sessionStore = new PgSessionStore({
  pool: pool,
  tableName: sessionStoreConfig.tableName,
  createTableIfMissing: sessionStoreConfig.createTableIfMissing,
  pruneSessionInterval: sessionStoreConfig.pruneSessionInterval,
  errorLog: (error) => {
    console.error('[SESSION STORE ERROR]:', error.message);
  },
});

/**
 * Middleware central de sessão configurado com práticas de segurança em profundidade:
 * - Cookie com nome ofuscado (não expõe que o backend corre Node.js/Express)
 * - HttpOnly obrigatório (previne roubo de sessão via scripts maliciosos no cliente)
 * - SameSite 'lax' (protecção base contra CSRF em navegação de topo)
 * - Secure condicionado ao ambiente de produção (HTTPS activo)
 */
export const sessionMiddleware = session({
  store: sessionStore,
  name: 'aq_session_id',
  secret: env.SESSION.secret,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Renova a expiração do cookie a cada requisição activa do utilizador
  cookie: {
    httpOnly: true,
    secure: env.IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: env.SESSION.maxAge,
    path: '/',
  },
});

export default sessionMiddleware;