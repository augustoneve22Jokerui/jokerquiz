import { env } from '../config/environment.js';
import { generateCsrfToken } from '../config/security.js';

/**
 * Middleware que injecta variáveis globais, dados de sessão autenticada,
 * mensagens flash, tokens CSRF e utilitários em res.locals.
 * Disponibiliza estas informações para todas as views e partials EJS
 * sem necessidade de repetição manual nos controladores.
 */
export const viewLocalsMiddleware = (req, res, next) => {
  // 1. Dados estruturais da aplicação
  res.locals.appName = env.APP_NAME;
  res.locals.appUrl = env.APP_URL;
  res.locals.isProduction = env.IS_PRODUCTION;
  res.locals.currentYear = new Date().getFullYear();
  res.locals.currentPath = req.path;
  res.locals.currency = env.BANK.currency;

  // 2. Estado de autenticação e contexto do utilizador
  const user = req.session?.user || null;
  res.locals.currentUser = user;
  res.locals.isAuthenticated = Boolean(user);
  res.locals.isAdmin = Boolean(user && (user.role === 'ADMIN' || user.roles?.includes('ADMIN')));
  res.locals.isModerator = Boolean(
    user && (user.role === 'MODERATOR' || user.role === 'ADMIN' || user.roles?.includes('MODERATOR'))
  );

  // 3. Gestão e consumo de mensagens flash da sessão
  res.locals.flash = {
    success: req.session?.flash?.success || null,
    error: req.session?.flash?.error || null,
    warning: req.session?.flash?.warning || null,
    info: req.session?.flash?.info || null,
  };

  // Limpa as mensagens flash da sessão após serem transferidas para a view
  if (req.session?.flash) {
    delete req.session.flash;
  }

  // 4. Token CSRF seguro para inclusão em formulários EJS e meta tags
  try {
    res.locals.csrfToken = generateCsrfToken(req, res);
  } catch (error) {
    res.locals.csrfToken = '';
  }

  // 5. Utilitários visuais de formatação acessíveis nos templates EJS
  res.locals.formatMoney = (amount) => {
    const value = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
    return `${new Intl.NumberFormat('pt-AO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)} ${env.BANK.currency}`;
  };

  res.locals.formatNumber = (number) => {
    const value = typeof number === 'number' ? number : parseInt(number, 10) || 0;
    return new Intl.NumberFormat('pt-AO').format(value);
  };

  next();
};

export default viewLocalsMiddleware;