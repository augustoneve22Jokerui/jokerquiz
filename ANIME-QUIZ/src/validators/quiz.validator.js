import { z } from 'zod';

/**
 * Esquema de validação para inicialização de uma sessão de quiz individual (Solo Run).
 * Cobre os modos 'TREINO' e 'RANQUEADO' e as quatro dificuldades oficiais.
 */
export const startQuizSessionSchema = z.object({
  mode: z
    .enum(['TREINO', 'RANQUEADO'], {
      required_error: 'O modo de jogo é obrigatório (TREINO ou RANQUEADO).',
      invalid_type_error: 'Modo de jogo inválido.',
    }),

  difficulty: z
    .enum(['INICIANTE', 'MEDIO', 'PROFISSIONAL', 'HOKAGE'], {
      required_error: 'A dificuldade da partida é obrigatória.',
      invalid_type_error: 'Dificuldade seleccionada inválida.',
    }),

  categoryId: z
    .coerce
    .number({ invalid_type_error: 'O identificador de categoria deve ser numérico.' })
    .int('O identificador de categoria deve ser um número inteiro.')
    .positive('Identificador de categoria inválido.')
    .optional(),

  totalQuestions: z
    .coerce
    .number()
    .int()
    .min(5, 'A sessão de quiz deve possuir no mínimo 5 perguntas.')
    .max(30, 'A sessão de quiz não pode exceder 30 perguntas.')
    .default(10),
});

/**
 * Esquema de validação para submissão de resposta a uma pergunta activa.
 * Inclui medição de tempo no cliente para validação e cruzamento anti-cheat no servidor.
 */
export const submitAnswerSchema = z.object({
  sessionId: z
    .string({ required_error: 'O identificador da sessão é obrigatório.' })
    .uuid('Identificador de sessão deve ser um UUID válido.'),

  questionId: z
    .coerce
    .number({ required_error: 'O identificador da pergunta é obrigatório.' })
    .int()
    .positive('Identificador de pergunta inválido.'),

  answerId: z
    .coerce
    .number()
    .int()
    .positive('Identificador de resposta inválido.')
    .nullable()
    .optional(),

  clientTimeMs: z
    .coerce
    .number({ required_error: 'O tempo de resposta é obrigatório.' })
    .int()
    .min(0, 'O tempo de resposta não pode ser negativo.')
    .max(65000, 'Tempo de resposta excedeu o limite máximo aceitável.'),
});

/**
 * Esquema de validação para parâmetros de rota contendo ID de sessão de quiz.
 */
export const quizSessionParamSchema = z.object({
  id: z
    .string({ required_error: 'O identificador da sessão é obrigatório.' })
    .uuid('Identificador de sessão de quiz deve ser um UUID válido.'),
});

/**
 * Esquema de validação para paginação e filtros no histórico de partidas do jogador.
 */
export const quizHistoryQuerySchema = z.object({
  page: z
    .coerce
    .number()
    .int()
    .min(1, 'A página deve ser maior ou igual a 1.')
    .default(1),

  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(50, 'Máximo de 50 registos por página.')
    .default(10),

  mode: z
    .enum(['TREINO', 'RANQUEADO'])
    .optional(),
});

export default {
  startQuizSessionSchema,
  submitAnswerSchema,
  quizSessionParamSchema,
  quizHistoryQuerySchema,
};