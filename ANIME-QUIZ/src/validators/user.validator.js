import { z } from 'zod';

/**
 * Esquema de validação para actualização dos dados públicos de perfil do jogador.
 */
export const updateProfileSchema = z.object({
  displayName: z
    .string({ required_error: 'O nome de apresentação é obrigatório.' })
    .trim()
    .min(2, 'O nome de apresentação deve ter no mínimo 2 caracteres.')
    .max(100, 'O nome de apresentação não pode exceder 100 caracteres.'),

  bio: z
    .string()
    .trim()
    .max(500, 'A biografia não pode exceder 500 caracteres.')
    .optional()
    .default(''),

  phoneNumber: z
    .string()
    .trim()
    .regex(
      /^(\+244|244)?[9][1-9][0-9]{7}$|^$/,
      'Formato de número telefónico inválido para Angola (+244 9XXXXXXXX).'
    )
    .optional()
    .or(z.literal('')),

  countryCode: z
    .string()
    .trim()
    .length(2, 'O código do país deve ter exactamente 2 caracteres (ISO 3166-1 alpha-2, ex: AO).')
    .toUpperCase()
    .default('AO'),
});

/**
 * Esquema de validação para selecção de avatar predefinido da galeria do ecossistema.
 */
export const selectAvatarSchema = z.object({
  avatarUrl: z
    .string({ required_error: 'A referência do avatar é obrigatória.' })
    .trim()
    .refine(
      (url) =>
        url.startsWith('/assets/images/avatars/') ||
        url.startsWith('https://') ||
        url.startsWith('/uploads/avatars/'),
      'Caminho de avatar inválido ou não autorizado.'
    ),
});

/**
 * Esquema de validação para parâmetros de rota contendo ID de utilizador (UUIDv4).
 */
export const userIdParamSchema = z.object({
  id: z
    .string({ required_error: 'O identificador do utilizador é obrigatório.' })
    .uuid('Identificador de utilizador deve ser um UUID válido.'),
});

/**
 * Esquema de validação para parâmetros de rota contendo username.
 */
export const usernameParamSchema = z.object({
  username: z
    .string({ required_error: 'O username é obrigatório.' })
    .trim()
    .min(3, 'Username inválido.')
    .max(30, 'Username inválido.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Formato de username inválido.')
    .transform((val) => val.toLowerCase()),
});

export default {
  updateProfileSchema,
  selectAvatarSchema,
  userIdParamSchema,
  usernameParamSchema,
};