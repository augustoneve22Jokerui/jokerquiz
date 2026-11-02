import { AppError } from './error.middleware.js';

/**
 * Middleware que exige autenticação ativa do utilizador.
 * 
 * - Se a requisição for de API/Fetch: responde com código 401 e payload JSON estruturado.
 * - Se a requisição for de navegação web (HTML): guarda o endereço de retorno em
 *   req.session.returnTo, define mensagem informativa e redireciona para a página de login.
 */
export const requireAuth = (req, res, next) => {
  const isApiRequest =
    req.xhr ||
    req.path.startsWith('/api') ||
    (req.headers.accept && req.headers.accept.includes('application/json'));

  if (!req.session || !req.session.user) {
    if (isApiRequest) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Acesso não autorizado. É necessário iniciar sessão para aceder a este recurso.',
        },
      });
    }

    // Preserva a página que o utilizador pretendia aceder para redirecionamento pós-login
    if (req.method === 'GET' && !req.path.startsWith('/auth')) {
      req.session.returnTo = req.originalUrl;
    }

    if (!req.session.flash) {
      req.session.flash = {};
    }
    req.session.flash.warning = 'Por favor, inicie sessão para continuar.';

    return res.redirect('/auth/login');
  }

  // Normaliza a referência ao utilizador autenticado no objecto da requisição
  req.user = req.session.user;
  next();
};

/**
 * Middleware que restringe o acesso exclusivo a utilizadores NÃO autenticados (convidados).
 * Impede que utilizadores já com sessão ativa acedam novamente a páginas como /auth/login e /auth/register,
 * redirecionando-os automaticamente para o /dashboard.
 */
export const requireGuest = (req, res, next) => {
  if (req.session && req.session.user) {
    const isApiRequest =
      req.xhr ||
      req.path.startsWith('/api') ||
      (req.headers.accept && req.headers.accept.includes('application/json'));

    if (isApiRequest) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ALREADY_AUTHENTICATED',
          message: 'Já possui uma sessão ativa na plataforma.',
        },
      });
    }

    return res.redirect('/dashboard');
  }

  next();
};

/**
 * Middleware opcional de autenticação.
 * Não bloqueia a requisição caso o utilizador seja um visitante anónimo,
 * mas popula req.user caso exista sessão ativa.
 */
export const optionalAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    req.user = req.session.user;
  } else {
    req.user = null;
  }
  next();
};

export default {
  requireAuth,
  requireGuest,
  optionalAuth,
};