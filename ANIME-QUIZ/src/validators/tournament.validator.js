import { z } from 'zod';

/**
 * Esquema de validação para criação de torneios oficiais (Administradores/Moderadores).
 * Garante regras estritas de datas, capacidade de chave eliminatória e valores monetários em AOA.
 */
export const createTournamentSchema = z
  .object({
    title: z
      .string({ required_error: 'O título do torneio é obrigatório.' })
      .trim()
      .min(3, 'O título deve ter no mínimo 3 caracteres.')
      .max(150, 'O título não pode exceder 150 caracteres.'),

    description: z
      .string({ required_error: 'A descrição do torneio é obrigatória.' })
      .trim()
      .min(10, 'A descrição deve ter no mínimo 10 caracteres.'),

    rules: z
      .string({ required_error: 'O regulamento do torneio é obrigatório.' })
      .trim()
      .min(10, 'O regulamento deve conter no mínimo 10 caracteres.'),

    difficulty: z
      .enum(['INICIANTE', 'MEDIO', 'PROFISSIONAL', 'HOKAGE'], {
        required_error: 'A dificuldade do torneio é obrigatória.',
        invalid_type_error: 'Dificuldade seleccionada inválida.',
      }),

    categoryId: z
      .coerce
      .number()
      .int()
      .positive('Identificador de categoria inválido.')
      .optional()
      .nullable(),

    maxParticipants: z
      .coerce
      .number()
      .int()
      .refine(
        (val) => [4, 8, 16, 32, 64, 128].includes(val),
        'A capacidade de participantes deve respeitar as chaves eliminatórias (4, 8, 16, 32, 64 ou 128).'
      ),

    isPaid: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => val === true || val === 'on' || val === 'true'),

    entryFee: z
      .coerce
      .number()
      .min(0, 'A taxa de inscrição não pode ser negativa.')
      .default(0),

    prizePool: z
      .coerce
      .number()
      .min(0, 'A premiação do torneio não pode ser negativa.')
      .default(0),

    registrationStartAt: z
      .string({ required_error: 'A data de início das inscrições é obrigatória.' })
      .datetime({ message: 'Formato de data inválido para início das inscrições (ISO 8601).' })
      .transform((val) => new Date(val)),

    registrationEndAt: z
      .string({ required_error: 'A data de término das inscrições é obrigatória.' })
      .datetime({ message: 'Formato de data inválido para fecho das inscrições (ISO 8601).' })
      .transform((val) => new Date(val)),

    tournamentStartAt: z
      .string({ required_error: 'A data de início do torneio é obrigatória.' })
      .datetime({ message: 'Formato de data inválido para início do torneio (ISO 8601).' })
      .transform((val) => new Date(val)),
  })
  .refine(
    (data) => data.registrationStartAt < data.registrationEndAt,
    {
      message: 'A data de fecho das inscrições deve ser posterior à data de abertura.',
      path: ['registrationEndAt'],
    }
  )
  .refine(
    (data) => data.registrationEndAt <= data.tournamentStartAt,
    {
      message: 'O torneio só pode começar após o encerramento das inscrições.',
      path: ['tournamentStartAt'],
    }
  )
  .refine(
    (data) => {
      if (data.isPaid && data.entryFee <= 0) {
        return false;
      }
      return true;
    },
    {
      message: 'Torneios pagos exigem um valor de taxa de inscrição superior a 0 AOA.',
      path: ['entryFee'],
    }
  );

/**
 * Esquema de validação para solicitação de inscrição de jogador em torneio.
 */
export const registerTournamentSchema = z.object({
  tournamentId: z
    .string({ required_error: 'O identificador do torneio é obrigatório.' })
    .uuid('Identificador de torneio deve ser um UUID válido.'),

  paymentMethod: z
    .enum(['BANK_TRANSFER', 'MULTICAIXA_EXPRESS'])
    .optional()
    .default('BANK_TRANSFER'),
});

/**
 * Esquema de validação para parâmetros de rota contendo ID de torneio.
 */
export const tournamentIdParamSchema = z.object({
  id: z
    .string({ required_error: 'O identificador do torneio é obrigatório.' })
    .uuid('Identificador de torneio deve ser um UUID válido.'),
});

/**
 * Esquema de validação para parâmetros de rota contendo slug do torneio.
 */
export const tournamentSlugParamSchema = z.object({
  slug: z
    .string({ required_error: 'O slug do torneio é obrigatório.' })
    .trim()
    .min(3, 'Slug de torneio inválido.'),
});

/**
 * Esquema de validação para filtros de pesquisa e listagem pública de torneios.
 */
export const tournamentFilterQuerySchema = z.object({
  status: z
    .enum([
      'DRAFT',
      'PUBLISHED',
      'REGISTRATION_OPEN',
      'REGISTRATION_CLOSED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ])
    .optional(),

  difficulty: z
    .enum(['INICIANTE', 'MEDIO', 'PROFISSIONAL', 'HOKAGE'])
    .optional(),

  isPaid: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }),

  page: z
    .coerce
    .number()
    .int()
    .min(1)
    .default(1),

  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(12),
});

export default {
  createTournamentSchema,
  registerTournamentSchema,
  tournamentIdParamSchema,
  tournamentSlugParamSchema,
  tournamentFilterQuerySchema,
};