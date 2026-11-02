import { z } from 'zod';

/**
 * Regex para validação de palavra-passe com requisitos de segurança competitiva:
 * Mínimo 8 caracteres, pelo menos uma maiúscula, uma minúscula, um dígito e um caractere especial.
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_\-#])[A-Za-z\d@$!%*?&_\-#]{8,}$/;

/**
 * Esquema de validação para o registo de novos jogadores.
 */
export const registerSchema = z
  .object({
    username: z
      .string({ required_error: 'O nome de utilizador (username) é obrigatório.' })
      .trim()
      .min(3, 'O username deve possuir no mínimo 3 caracteres.')
      .max(30, 'O username não pode exceder 30 caracteres.')
      .regex(
        /^[a-zA-Z0-9_]+$/,
        'O username deve conter apenas caracteres alfanuméricos e underscores (_) sem espaços.'
      )
      .transform((val) => val.toLowerCase()),

    displayName: z
      .string({ required_error: 'O nome de apresentação é obrigatório.' })
      .trim()
      .min(2, 'O nome de apresentação deve ter pelo menos 2 caracteres.')
      .max(100, 'O nome de apresentação não pode exceder 100 caracteres.'),

    email: z
      .string({ required_error: 'O email é obrigatório.' })
      .trim()
      .email('Endereço de email inválido.')
      .max(255, 'O email não pode exceder 255 caracteres.')
      .transform((val) => val.toLowerCase()),

    password: z
      .string({ required_error: 'A palavra-passe é obrigatória.' })
      .min(8, 'A palavra-passe deve ter pelo menos 8 caracteres.')
      .max(100, 'A palavra-passe não pode exceder 100 caracteres.')
      .regex(
        PASSWORD_REGEX,
        'A palavra-passe deve conter pelo menos uma letra maiúscula, uma minúscula, um número e um caractere especial (@$!%*?&_-#).'
      ),

    confirmPassword: z
      .string({ required_error: 'A confirmação da palavra-passe é obrigatória.' }),

    terms: z
      .union([z.boolean(), z.string()])
      .refine(
        (val) => val === true || val === 'on' || val === 'true',
        'Deve aceitar os termos de serviço e regulamento da plataforma para prosseguir.'
      ),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As palavras-passe introduzidas não coincidem.',
    path: ['confirmPassword'],
  });

/**
 * Esquema de validação para autenticação / login de jogadores.
 */
export const loginSchema = z.object({
  login: z
    .string({ required_error: 'Introduza o seu email ou nome de utilizador.' })
    .trim()
    .min(3, 'Credencial inválida ou demasiado curta.')
    .max(255)
    .transform((val) => val.toLowerCase()),

  password: z
    .string({ required_error: 'A palavra-passe é obrigatória.' })
    .min(1, 'A palavra-passe não pode estar em branco.'),

  rememberMe: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => val === true || val === 'on' || val === 'true'),
});

/**
 * Esquema de validação para solicitação de recuperação de palavra-passe.
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'O email de registo é obrigatório.' })
    .trim()
    .email('Introduza um formato de email válido.')
    .transform((val) => val.toLowerCase()),
});

/**
 * Esquema de validação para redefinição definitiva de palavra-passe com token.
 */
export const resetPasswordSchema = z
  .object({
    token: z
      .string({ required_error: 'O token de segurança é obrigatório.' })
      .trim()
      .min(10, 'Token de recuperação inválido ou expirado.'),

    password: z
      .string({ required_error: 'A nova palavra-passe é obrigatória.' })
      .min(8, 'A palavra-passe deve ter pelo menos 8 caracteres.')
      .regex(
        PASSWORD_REGEX,
        'A nova palavra-passe deve conter maiúsculas, minúsculas, números e caracteres especiais.'
      ),

    confirmPassword: z
      .string({ required_error: 'Confirme a nova palavra-passe.' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As palavras-passe introduzidas não coincidem.',
    path: ['confirmPassword'],
  });

/**
 * Esquema de validação para alteração de palavra-passe com utilizador autenticado.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'A palavra-passe actual é obrigatória.' })
      .min(1, 'Introduza a sua palavra-passe actual.'),

    newPassword: z
      .string({ required_error: 'A nova palavra-passe é obrigatória.' })
      .min(8, 'A nova palavra-passe deve ter pelo menos 8 caracteres.')
      .regex(
        PASSWORD_REGEX,
        'A nova palavra-passe deve satisfazer os requisitos de complexidade.'
      ),

    confirmNewPassword: z
      .string({ required_error: 'Confirme a nova palavra-passe.' }),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'A nova palavra-passe e a respectiva confirmação não coincidem.',
    path: ['confirmNewPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'A nova palavra-passe deve ser diferente da palavra-passe actual.',
    path: ['newPassword'],
  });

export default {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
};