import { ZodError } from 'zod';
import { env } from '../config/environment.js';

/**
 * Classe de erro customizada para falhas operacionais previsíveis da aplicação.
 */
export class AppError extends Error {
  /**
   * @param {string} message - Mensagem compreensível sobre a falha
   * @param {number} [statusCode=500] - Código de estado HTTP
   * @param {string} [errorCode='APP_ERROR'] - Identificador interno para auditoria/frontend
   * @param {any} [details=null] - Detalhes adicionais (erros de campo, payloads, etc.)
   */
  constructor(message, statusCode = 500, errorCode = 'APP_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Middleware para captura de rotas inexistentes (404 Not Found).
 */
export const notFoundHandler = (req, res, next) => {
  next(new AppError(`A rota ${req.method} ${req.originalUrl} não foi encontrada no servidor.`, 404, 'ROUTE_NOT_FOUND'));
};

/**
 * Middleware centralizado de tratamento e sanitização de erros.
 * Garante que nenhuma stack trace ou informação sensível seja exposta em produção
 * e formata respostas adequadas conforme o cliente solicite JSON ou HTML.
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Ocorreu um erro interno inesperado no servidor.';
  let errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';
  let details = err.details || null;

  // 1. Tratamento específico para erros de validação Zod
  if (err instanceof ZodError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Dados inválidos fornecidos no formulário ou requisição.';
    details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  }

  // 2. Tratamento específico para falhas de validação CSRF (csrf-csrf)
  if (err.name === 'InvalidCsrfTokenError' || err.code === 'EBADCSRFTOKEN' || err.message?.includes('CSRF')) {
    statusCode = 403;
    errorCode = 'INVALID_CSRF_TOKEN';
    message = 'Sessão de formulário expirada ou token de segurança inválido. Atualize a página e tente novamente.';
  }

  // 3. Tratamento para erros de limite de ficheiro (Multer)
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    errorCode = 'FILE_TOO_LARGE';
    message = 'O ficheiro enviado excede o limite máximo permitido de 5MB.';
  }

  // Registo de log estruturado no servidor
  if (statusCode >= 500) {
    console.error('[CRITICAL SERVER ERROR]:', {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      error: {
        message: err.message,
        stack: err.stack,
      },
    });
  } else if (env.IS_DEVELOPMENT) {
    console.warn(`[WARN HTTP ${statusCode}]: ${req.method} ${req.originalUrl} - ${message}`);
  }

  // Identifica se a requisição espera payload JSON ou é uma navegação via browser (HTML)
  const isApiRequest =
    req.xhr ||
    req.path.startsWith('/api') ||
    (req.headers.accept && req.headers.accept.includes('application/json'));

  if (isApiRequest) {
    return res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message: message,
        details: details,
        ...(env.IS_DEVELOPMENT && statusCode >= 500 ? { stack: err.stack } : {}),
      },
    });
  }

  // Resposta para páginas renderizadas via EJS (ou fallback caso as views ainda estejam a ser carregadas)
  const viewMap = {
    400: 'errors/400',
    403: 'errors/403',
    404: 'errors/404',
    429: 'errors/429',
    500: 'errors/500',
  };

  const targetView = viewMap[statusCode] || 'errors/500';

  res.status(statusCode);
  return res.render(targetView, {
    title: `Erro ${statusCode} — Anime Quiz`,
    statusCode,
    errorCode,
    message,
    details,
    isDevelopment: env.IS_DEVELOPMENT,
    stack: env.IS_DEVELOPMENT && statusCode >= 500 ? err.stack : null,
  }, (renderError, html) => {
    if (renderError) {
      // Fallback seguro caso a view EJS correspondente ainda não tenha sido gerada
      return res.type('html').send(`
        <!DOCTYPE html>
        <html lang="pt">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Erro ${statusCode} — Anime Quiz</title>
            <style>
              body { background-color: #0b0e14; color: #f8fafc; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
              .card { background: #151a23; border: 1px solid #ff0055; border-radius: 12px; padding: 32px; max-width: 520px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
              h1 { color: #ff0055; margin-bottom: 12px; font-size: 2.2rem; }
              p { color: #94a3b8; font-size: 1rem; line-height: 1.5; margin-bottom: 24px; }
              a { display: inline-block; background: #00f2fe; color: #0b0e14; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Erro ${statusCode}</h1>
              <p>${message}</p>
              <a href="/">Voltar ao Início</a>
            </div>
          </body>
        </html>
      `);
    }
    return res.send(html);
  });
};

export default {
  AppError,
  notFoundHandler,
  errorHandler,
};