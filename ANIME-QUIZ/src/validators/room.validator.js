import { z } from 'zod';

/**
 * Esquema de validação para criação de uma sala multiplayer (Lobby).
 */
export const createRoomSchema = z
  .object({
    name: z
      .string({ required_error: 'O nome da sala é obrigatório.' })
      .trim()
      .min(3, 'O nome da sala deve ter no mínimo 3 caracteres.')
      .max(60, 'O nome da sala não pode exceder 60 caracteres.'),

    isPrivate: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => val === true || val === 'on' || val === 'true'),

    password: z
      .string()
      .trim()
      .max(30, 'A palavra-passe da sala não pode exceder 30 caracteres.')
      .optional()
      .or(z.literal('')),

    maxPlayers: z
      .coerce
      .number()
      .int()
      .min(2, 'A sala deve permitir no mínimo 2 jogadores.')
      .max(32, 'O limite máximo é de 32 jogadores por sala.')
      .default(8),

    difficulty: z
      .enum(['INICIANTE', 'MEDIO', 'PROFISSIONAL', 'HOKAGE'], {
        required_error: 'A dificuldade da sala é obrigatória.',
        invalid_type_error: 'Dificuldade seleccionada inválida.',
      }),

    categoryId: z
      .coerce
      .number()
      .int()
      .positive('Identificador de categoria inválido.')
      .optional(),

    questionsCount: z
      .coerce
      .number()
      .int()
      .min(5, 'A partida deve ter no mínimo 5 perguntas.')
      .max(50, 'A partida não pode ter mais de 50 perguntas.')
      .default(10),

    timePerQuestion: z
      .coerce
      .number()
      .int()
      .min(5, 'O tempo mínimo por pergunta é de 5 segundos.')
      .max(60, 'O tempo máximo por pergunta é de 60 segundos.')
      .default(15),
  })
  .refine(
    (data) => {
      if (data.isPrivate && (!data.password || data.password.length < 4)) {
        return false;
      }
      return true;
    },
    {
      message: 'Salas privadas exigem uma palavra-passe com no mínimo 4 caracteres.',
      path: ['password'],
    }
  );

/**
 * Esquema de validação para entrada em sala via código alfanumérico curto.
 */
export const joinRoomByCodeSchema = z.object({
  code: z
    .string({ required_error: 'O código da sala é obrigatório.' })
    .trim()
    .min(4, 'O código da sala deve ter entre 4 e 8 caracteres.')
    .max(8, 'O código da sala deve ter entre 4 e 8 caracteres.')
    .transform((val) => val.toUpperCase()),

  password: z
    .string()
    .trim()
    .optional(),
});

/**
 * Esquema de validação para envio de convite directo a outro jogador.
 */
export const roomInviteSchema = z.object({
  roomId: z
    .string({ required_error: 'O identificador da sala é obrigatório.' })
    .uuid('Identificador de sala deve ser um UUID válido.'),

  inviteeUserId: z
    .string({ required_error: 'O identificador do jogador convidado é obrigatório.' })
    .uuid('Identificador de utilizador deve ser um UUID válido.'),
});

/**
 * Esquema de validação para parâmetros de rota contendo ID de sala (UUID).
 */
export const roomIdParamSchema = z.object({
  id: z
    .string({ required_error: 'O identificador da sala é obrigatório.' })
    .uuid('Identificador de sala deve ser um UUID válido.'),
});

/**
 * Esquema de validação para parâmetros de rota contendo código da sala.
 */
export const roomCodeParamSchema = z.object({
  code: z
    .string({ required_error: 'O código da sala é obrigatório.' })
    .trim()
    .min(4)
    .max(8)
    .transform((val) => val.toUpperCase()),
});

export default {
  createRoomSchema,
  joinRoomByCodeSchema,
  roomInviteSchema,
  roomIdParamSchema,
  roomCodeParamSchema,
};