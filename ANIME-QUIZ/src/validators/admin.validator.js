import { z } from 'zod';

/**
 * Esquema de validação para suspensão ou activação de utilizadores por administradores.
 */
export const manageUserStatusSchema = z.object({
  userId: z
    .string({ required_error: 'O identificador do utilizador é obrigatório.' })
    .uuid('Identificador de utilizador deve ser um UUID válido.'),

  isActive: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true'),

  reason: z
    .string()
    .trim()
    .max(500, 'O motivo não pode exceder 500 caracteres.')
    .optional()
    .default(''),
});

/**
 * Esquema de validação para atribuição de papéis (Roles) a utilizadores.
 */
export const assignUserRoleSchema = z.object({
  userId: z
    .string({ required_error: 'O identificador do utilizador é obrigatório.' })
    .uuid('Identificador de utilizador deve ser um UUID válido.'),

  roleName: z
    .enum(['ADMIN', 'MODERATOR', 'PLAYER'], {
      required_error: 'O papel a atribuir é obrigatório (ADMIN, MODERATOR ou PLAYER).',
    }),
});

/**
 * Esquema de validação para criação de perguntas do quiz no painel administrativo.
 * Garante que cada questão tenha exactamente 4 alternativas e uma única resposta correcta.
 */
export const createQuestionSchema = z
  .object({
    categoryId: z
      .coerce
      .number({ required_error: 'A categoria da pergunta é obrigatória.' })
      .int()
      .positive('Identificador de categoria inválido.'),

    animeId: z
      .coerce
      .number()
      .int()
      .positive('Identificador de anime inválido.')
      .optional()
      .nullable(),

    questionText: z
      .string({ required_error: 'O enunciado da pergunta é obrigatório.' })
      .trim()
      .min(10, 'O enunciado deve ter pelo menos 10 caracteres.'),

    imageUrl: z
      .string()
      .trim()
      .url('A imagem deve ser uma URL válida.')
      .optional()
      .or(z.literal(''))
      .nullable(),

    difficulty: z
      .enum(['INICIANTE', 'MEDIO', 'PROFISSIONAL', 'HOKAGE'], {
        required_error: 'A dificuldade é obrigatória.',
      }),

    explanation: z
      .string()
      .trim()
      .max(1000, 'A explicação não pode exceder 1000 caracteres.')
      .optional()
      .default(''),

    timeLimitSeconds: z
      .coerce
      .number()
      .int()
      .min(5, 'O tempo mínimo é de 5 segundos.')
      .max(60, 'O tempo máximo é de 60 segundos.')
      .default(15),

    basePoints: z
      .coerce
      .number()
      .int()
      .min(10, 'A pontuação base deve ser de pelo menos 10 pontos.')
      .default(100),

    baseXp: z
      .coerce
      .number()
      .int()
      .min(5, 'O XP base deve ser de pelo menos 5.')
      .default(25),

    answers: z
      .array(
        z.object({
          text: z
            .string({ required_error: 'O texto da alternativa é obrigatório.' })
            .trim()
            .min(1, 'A alternativa não pode estar vazia.')
            .max(500, 'A alternativa não pode exceder 500 caracteres.'),

          isCorrect: z
            .union([z.boolean(), z.string()])
            .transform((val) => val === true || val === 'true' || val === '1'),

          order: z
            .coerce
            .number()
            .int()
            .min(1)
            .max(4),
        })
      )
      .length(4, 'A pergunta deve conter exactamente 4 alternativas.'),
  })
  .refine(
    (data) => {
      const correctCount = data.answers.filter((a) => a.isCorrect === true).length;
      return correctCount === 1;
    },
    {
      message: 'Deve existir exactamente 1 alternativa marcada como correcta.',
      path: ['answers'],
    }
  );

/**
 * Esquema de validação para criação de categorias de anime no catálogo.
 */
export const createCategorySchema = z.object({
  name: z
    .string({ required_error: 'O nome da categoria é obrigatório.' })
    .trim()
    .min(2, 'O nome deve ter no mínimo 2 caracteres.')
    .max(100, 'O nome não pode exceder 100 caracteres.'),

  description: z
    .string()
    .trim()
    .max(500, 'A descrição não pode exceder 500 caracteres.')
    .optional()
    .default(''),

  iconName: z
    .string()
    .trim()
    .max(50)
    .default('sparkles'),

  colorHex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'A cor deve estar em formato hexadecimal válido (ex: #00f2fe).')
    .default('#00f2fe'),
});

/**
 * Esquema de validação para alteração de parâmetros operacionais do sistema.
 */
export const updateSystemSettingSchema = z.object({
  key: z
    .string({ required_error: 'A chave da configuração é obrigatória.' })
    .trim()
    .min(3, 'Chave de configuração inválida.'),

  value: z
    .string({ required_error: 'O valor da configuração é obrigatório.' })
    .trim(),
});

/**
 * Esquema de validação para resolução de denúncias de jogadores (Reports).
 */
export const resolveReportSchema = z.object({
  reportId: z
    .string({ required_error: 'O identificador da denúncia é obrigatório.' })
    .uuid('Identificador de denúncia deve ser um UUID válido.'),

  status: z
    .enum(['INVESTIGATING', 'RESOLVED', 'DISMISSED'], {
      required_error: 'O novo estado da denúncia é obrigatório.',
    }),

  resolutionNotes: z
    .string({ required_error: 'As notas de resolução são obrigatórias.' })
    .trim()
    .min(5, 'As notas de resolução devem ter no mínimo 5 caracteres.')
    .max(1000, 'As notas de resolução não podem exceder 1000 caracteres.'),
});

export default {
  manageUserStatusSchema,
  assignUserRoleSchema,
  createQuestionSchema,
  createCategorySchema,
  updateSystemSettingSchema,
  resolveReportSchema,
};