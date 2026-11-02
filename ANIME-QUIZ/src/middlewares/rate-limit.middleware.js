import rateLimit from 'express-rate-limit';
import { AppError } from './error.middleware.js';
import { env } from '../config/environment.js';

/**
 * Função geradora de manipulador customizado de excedente de requisições.
 * Garante que clientes de API recebam JSON estruturado e navegações recebam status 429
 * canalizado pelo middleware central de erros.
 * 
 * @param {string} message - Mensagem amigável de bloqueio temporário
 * @param {string} [errorCode='RATE_LIMIT_EXCEEDED'] - Código interno
 */
const createLimitHandler = (message, errorCode = 'RATE_LIMIT_EXCEEDED') => {
  return (req, res, next) => {
    const isApiRequest =
      req.xhr ||
      req.path.startsWith('/api') ||
      (req.headers.accept && req.headers.accept.includes('application/json'));

    if (isApiRequest) {
      return res.status(429).json({
        success: false,
        error: {
          code: errorCode,
          message,
        },
      });
    }

    return next(new AppError(message, 429, errorCode));
  };
};

/**
 * Limitador global para mitigar ataques de negação de serviço e sobrecarga de tráfego.
 * Aplicado em todas as rotas públicas e autenticadas da aplicação.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Janela de 15 minutos
  max: env.IS_PRODUCTION ? 300 : 3000, // 300 requisições por IP em produção
  standardHeaders: true,
  legacyHeaders: false,
  handler: createLimitHandler(
    'Limite de requisições excedido temporariamente. Por favor, aguarde alguns minutos antes de tentar novamente.',
    'GLOBAL_RATE_LIMIT_EXCEEDED'
  ),
});

/**
 * Limitador agressivo para rotas críticas de autenticação (Login, Registo, Recuperação de Senha).
 * Previne ataques de força bruta contra senhas e enumeração de credenciais.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Janela de 15 minutos
  max: env.IS_PRODUCTION ? 10 : 100, // 10 tentativas a cada 15 minutos por IP
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: createLimitHandler(
    'Demasiadas tentativas de autenticação ou submissão de credenciais. Por segurança, aguarde 15 minutos.',
    'AUTH_RATE_LIMIT_EXCEEDED'
  ),
});

/**
 * Limitador para endpoints de dados assíncronos e chamadas de API internas.
 */
export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // Janela de 5 minutos
  max: env.IS_PRODUCTION ? 120 : 1200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createLimitHandler(
    'Frequência de chamadas à API excedeu o limite operacional.',
    'API_RATE_LIMIT_EXCEEDED'
  ),
});

/**
 * Limitador específico para submissão de respostas do Quiz.
 * Impede que scripts automatizados enviem dezenas de respostas por segundo na tentativa de adivinhação.
 */
export const quizAnswerLimiter = rateLimit({
  windowMs: 10 * 1000, // Janela de 10 segundos
  max: 12, // Máximo razoável para leitura e resposta humana
  standardHeaders: true,
  legacyHeaders: false,
  handler: createLimitHandler(
    'Ritmo de respostas considerado anómalo pelo sistema anti-cheat. Aguarde alguns segundos.',
    'QUIZ_SPAM_DETECTED'
  ),
});

/**
 * Limitador de uploads de ficheiros (comprovativos de pagamento e avatares).
 * Evita saturação do storage e esgotamento de I/O em multipart/form-data.
 */
export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // Janela de 10 minutos
  max: 10, // Máximo de 10 envios por janela
  standardHeaders: true,
  legacyHeaders: false,
  handler: createLimitHandler(
    'Limite de upload de ficheiros atingido. Tente novamente mais tarde.',
    'UPLOAD_RATE_LIMIT_EXCEEDED'
  ),
});

export default {
  globalLimiter,
  authLimiter,
  apiLimiter,
  quizAnswerLimiter,
  uploadLimiter,
};