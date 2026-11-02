import { ZodError } from 'zod';
import { AppError } from './error.middleware.js';

/**
 * Sanitiza o corpo da requisição removendo senhas e campos sensíveis
 * antes de reaproveitar os dados em mensagens flash de erro.
 * 
 * @param {Record<string, any>} body
 * @returns {Record<string, any>}
 */
const sanitizeForFlash = (body = {}) => {
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'confirmPassword', 'currentPassword', 'newPassword', '_csrf'];
  sensitiveFields.forEach((field) => {
    delete sanitized[field];
  });
  return sanitized;
};

/**
 * Middleware genérico para validação de requisições com esquemas Zod.
 * Suporta validação de `body`, `query` e `params` simultaneamente ou de forma individual.
 * 
 * Se os dados forem inválidos:
 * - Em chamadas assíncronas (API/Fetch/AJAX): responde imediatamente com status 400 e JSON detalhado.
 * - Em submissões tradicionais de formulários HTML (quando redirectBack = true):
 *   guarda erros de validação e dados anteriores em req.session.flash e redireciona de volta.
 * 
 * @param {Object} schemas
 * @param {import('zod').ZodSchema} [schemas.body] - Esquema para req.body
 * @param {import('zod').ZodSchema} [schemas.query] - Esquema para req.query
 * @param {import('zod').ZodSchema} [schemas.params] - Esquema para req.params
 * @param {Object} [options]
 * @param {boolean} [options.redirectBack=false] - Forçar redirecionamento com flash em formulários EJS
 * @returns {import('express').RequestHandler}
 */
export const validate = (schemas = {}, options = { redirectBack: false }) => {
  return async (req, res, next) => {
    const isApiRequest =
      req.xhr ||
      req.path.startsWith('/api') ||
      (req.headers.accept && req.headers.accept.includes('application/json'));

    const validationErrors = [];

    // Objeto consolidado para armazenar dados parseados e tipados pelo Zod
    if (!req.validated) {
      req.validated = {};
    }

    // 1. Validação de Parâmetros de Rota (req.params)
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          validationErrors.push({
            location: 'params',
            path: issue.path.join('.'),
            message: issue.message,
          });
        });
      } else {
        req.params = result.data;
        req.validated.params = result.data;
      }
    }

    // 2. Validação de Query Strings (req.query)
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          validationErrors.push({
            location: 'query',
            path: issue.path.join('.'),
            message: issue.message,
          });
        });
      } else {
        req.query = result.data;
        req.validated.query = result.data;
      }
    }

    // 3. Validação do Corpo da Requisição (req.body)
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          validationErrors.push({
            location: 'body',
            path: issue.path.join('.'),
            message: issue.message,
          });
        });
      } else {
        req.body = result.data;
        req.validated.body = result.data;
      }
    }

    // Se houverem falhas estruturais nos dados
    if (validationErrors.length > 0) {
      const firstErrorMessage = validationErrors[0]?.message || 'Dados inválidos fornecidos.';

      if (isApiRequest || !options.redirectBack) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: firstErrorMessage,
            details: validationErrors,
          },
        });
      }

      // Redirecionamento amigável com flash para formulários web
      if (!req.session.flash) {
        req.session.flash = {};
      }
      req.session.flash.error = firstErrorMessage;
      req.session.flash.formErrors = validationErrors;
      req.session.flash.oldInput = sanitizeForFlash(req.body);

      const referer = req.get('Referrer') || '/';
      return res.redirect(referer);
    }

    next();
  };
};

/**
 * Validador simplificado para rotas que validam apenas o corpo (req.body).
 * 
 * @param {import('zod').ZodSchema} schema - Esquema Zod para o body
 * @param {boolean} [redirectBack=false]
 */
export const validateBody = (schema, redirectBack = false) => {
  return validate({ body: schema }, { redirectBack });
};

/**
 * Validador simplificado para rotas que validam apenas os parâmetros de URL (ex: :id, :slug).
 * 
 * @param {import('zod').ZodSchema} schema - Esquema Zod para params
 */
export const validateParams = (schema) => {
  return validate({ params: schema }, { redirectBack: false });
};

/**
 * Validador simplificado para rotas com filtros de busca e paginação (req.query).
 * 
 * @param {import('zod').ZodSchema} schema - Esquema Zod para query
 */
export const validateQuery = (schema) => {
  return validate({ query: schema }, { redirectBack: false });
};

export default {
  validate,
  validateBody,
  validateParams,
  validateQuery,
};