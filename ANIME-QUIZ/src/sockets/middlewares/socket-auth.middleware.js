/**
 * Middleware do Socket.IO para autenticação e vinculação de sessão de utilizador no Handshake.
 * Recupera os dados do utilizador a partir da sessão Express persistida no PostgreSQL Neon
 * (previamente acoplada via io.engine.use(sessionMiddleware)).
 * 
 * @param {import('socket.io').Socket} socket
 * @param {(err?: Error) => void} next
 */
export const socketAuthMiddleware = (socket, next) => {
  try {
    const session = socket.request.session;

    if (session && session.user) {
      // Vincula os dados autenticados ao contexto exclusivo do Socket
      socket.data.user = session.user;
      socket.data.userId = session.user.id;
      socket.data.username = session.user.username;
      socket.data.displayName = session.user.displayName;
      socket.data.role = session.user.role;
      socket.data.isAuthenticated = true;

      // Junta automaticamente o socket a uma sala individual privada para notificações directas
      socket.join(`user:${session.user.id}`);
    } else {
      socket.data.user = null;
      socket.data.userId = null;
      socket.data.isAuthenticated = false;
    }

    next();
  } catch (error) {
    console.error('[SOCKET AUTH ERROR] Falha ao processar sessão no handshake:', error.message);
    next(new Error('FALHA_AUTENTICACAO_SOCKET'));
  }
};

/**
 * Middleware estrito para eventos de WebSocket que exigem autenticação obrigatória.
 * Bloqueia a participação em partidas ranqueadas ou envio de mensagens sem sessão activa.
 * 
 * @param {import('socket.io').Socket} socket
 * @param {(err?: Error) => void} next
 */
export const requireSocketAuth = (socket, next) => {
  if (!socket.data || !socket.data.isAuthenticated || !socket.data.userId) {
    return next(new Error('AUTENTICACAO_NECESSARIA_SOCKET'));
  }
  next();
};

export default {
  socketAuthMiddleware,
  requireSocketAuth,
};