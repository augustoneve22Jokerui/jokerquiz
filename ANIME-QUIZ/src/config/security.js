import helmet from 'helmet';
import cors from 'cors';
import { doubleCsrf } from 'csrf-csrf';
import { env } from './environment.js';

/**
 * Middleware para análise nativa de cookies HTTP sem dependências externas adicionais.
 * Popula req.cookies a partir do cabeçalho 'cookie' caso ainda não tenha sido definido.
 */
export const cookieParserMiddleware = (req, res, next) => {
  if (!req.cookies) {
    req.cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      cookieHeader.split(';').forEach((cookie) => {
        const parts = cookie.split('=');
        const name = parts[0]?.trim();
        const value = parts.slice(1).join('=').trim();
        if (name) {
          req.cookies[name] = decodeURIComponent(value);
        }
      });
    }
  }
  next();
};

/**
 * Configuração das políticas de cabeçalhos de segurança via Helmet.
 * Permite fontes seguras para Bootstrap 5, Google Fonts, conexões WebSocket
 * e imagens externas da API do MyAnimeList (Jikan).
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://cdn.jsdelivr.net',
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://cdn.jsdelivr.net',
        'https://fonts.googleapis.com',
      ],
      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
        'https://cdn.jsdelivr.net',
      ],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https://cdn.myanimelist.net',
        'https://images.unsplash.com',
      ],
      connectSrc: [
        "'self'",
        'ws:',
        'wss:',
        env.APP_URL,
        env.JIKAN.baseUrl,
      ],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: env.IS_PRODUCTION ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
});

/**
 * Configuração de CORS com suporte a credenciais e restrição de origens.
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Permite requisições sem origem (como ferramentas internas, mobile ou curl no Render)
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

    return callback(new Error('Bloqueado pelas políticas de CORS do Anime Quiz.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-csrf-token',
    'csrf-token',
  ],
});

/**
 * Configuração do CSRF (Double Submit Cookie Pattern).
 * Fornece proteção contra requisições forjadas com cookies Lax/Strict.
 */
const csrfOptions = {
  getSecret: () => env.SECURITY.csrfSecret,
  cookieName: 'aq_csrf_token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: env.IS_PRODUCTION,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => {
    return (
      req.body?._csrf ||
      req.headers['x-csrf-token'] ||
      req.headers['csrf-token'] ||
      req.query?._csrf
    );
  },
};

export const {
  invalidCsrfTokenError,
  generateToken: generateCsrfToken,
  validateRequest: validateCsrfRequest,
  doubleCsrfProtection: csrfProtectionMiddleware,
} = doubleCsrf(csrfOptions);

export default {
  cookieParserMiddleware,
  helmetMiddleware,
  corsMiddleware,
  csrfProtectionMiddleware,
  generateCsrfToken,
  invalidCsrfTokenError,
};