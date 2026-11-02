import dotenv from 'dotenv';
import { z } from 'zod';

// Garante o carregamento do ficheiro .env se ainda não tiver sido inicializado pelo runtime
dotenv.config();

/**
 * Esquema de validação das variáveis de ambiente utilizando Zod.
 * Qualquer ausência ou formato incorreto interrompe o arranque do processo,
 * prevenindo execuções em estado inconsistente ou vulnerável.
 */
const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
      message: 'A porta especificada deve ser um número inteiro entre 1 e 65535.',
    }),
  APP_NAME: z.string().default('Anime Quiz Ecosystem'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Base de Dados Neon (PostgreSQL)
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL é obrigatória para conexão com a base de dados PostgreSQL.'),
  DB_SSL: z
    .string()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
  DB_POOL_MAX: z
    .string()
    .default('20')
    .transform((val) => parseInt(val, 10)),
  DB_POOL_IDLE_TIMEOUT_MS: z
    .string()
    .default('30000')
    .transform((val) => parseInt(val, 10)),
  DB_POOL_CONNECTION_TIMEOUT_MS: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10)),

  // Sessões e Segurança
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET deve possuir pelo menos 32 caracteres para garantir entropia criptográfica.'),
  SESSION_MAX_AGE_MS: z
    .string()
    .default('86400000')
    .transform((val) => parseInt(val, 10)),
  CSRF_SECRET: z
    .string()
    .min(32, 'CSRF_SECRET deve possuir pelo menos 32 caracteres de segurança.'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Armazenamento
  UPLOAD_BASE_DIR: z.string().default('./storage/uploads'),
  TEMP_STORAGE_DIR: z.string().default('./storage/temp'),
  MAX_FILE_SIZE_BYTES: z
    .string()
    .default('5242880')
    .transform((val) => parseInt(val, 10)),

  // Financeiro e Pagamentos (Angola - AOA)
  DEFAULT_CURRENCY: z.string().default('AOA'),
  BANK_NAME: z.string().default('Banco Angolano de Investimentos (BAI)'),
  BANK_ACCOUNT_NAME: z.string().default('Anime Quiz Lda'),
  BANK_IBAN: z.string().min(10, 'BANK_IBAN é obrigatório para recepção de transferências.'),
  BANK_ACCOUNT_NUMBER: z.string().min(5, 'BANK_ACCOUNT_NUMBER é obrigatório.'),
  MULTICAIXA_EXPRESS_PHONE: z.string().min(9, 'MULTICAIXA_EXPRESS_PHONE é obrigatório.'),

  // Integração Externa Jikan
  JIKAN_API_BASE_URL: z.string().url().default('https://api.jikan.moe/v4'),
  JIKAN_REQUEST_DELAY_MS: z
    .string()
    .default('500')
    .transform((val) => parseInt(val, 10)),

  // Seed Admin
  ADMIN_DEFAULT_USERNAME: z.string().min(3).default('hokage_admin'),
  ADMIN_DEFAULT_EMAIL: z.string().email().default('admin@animequiz.ao'),
  ADMIN_DEFAULT_PASSWORD: z.string().min(8).default('Mudar@Senha123Segura!'),
});

const parseEnvironment = () => {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    console.error('CRITICAL: Falha na validação das variáveis de ambiente:');
    result.error.issues.forEach((issue) => {
      console.error(` - [${issue.path.join('.')}] ${issue.message}`);
    });
    process.exit(1);
  }

  const data = result.data;

  return Object.freeze({
    NODE_ENV: data.NODE_ENV,
    IS_PRODUCTION: data.NODE_ENV === 'production',
    IS_DEVELOPMENT: data.NODE_ENV === 'development',
    PORT: data.PORT,
    APP_NAME: data.APP_NAME,
    APP_URL: data.APP_URL,

    DB: {
      url: data.DATABASE_URL,
      ssl: data.DB_SSL,
      poolMax: data.DB_POOL_MAX,
      idleTimeoutMillis: data.DB_POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: data.DB_POOL_CONNECTION_TIMEOUT_MS,
    },

    SESSION: {
      secret: data.SESSION_SECRET,
      maxAge: data.SESSION_MAX_AGE_MS,
    },

    SECURITY: {
      csrfSecret: data.CSRF_SECRET,
      corsOrigin: data.CORS_ORIGIN,
    },

    STORAGE: {
      uploadBaseDir: data.UPLOAD_BASE_DIR,
      tempDir: data.TEMP_STORAGE_DIR,
      maxFileSizeBytes: data.MAX_FILE_SIZE_BYTES,
    },

    BANK: {
      currency: data.DEFAULT_CURRENCY,
      name: data.BANK_NAME,
      accountName: data.BANK_ACCOUNT_NAME,
      iban: data.BANK_IBAN,
      accountNumber: data.BANK_ACCOUNT_NUMBER,
      multicaixaPhone: data.MULTICAIXA_EXPRESS_PHONE,
    },

    JIKAN: {
      baseUrl: data.JIKAN_API_BASE_URL,
      requestDelayMs: data.JIKAN_REQUEST_DELAY_MS,
    },

    ADMIN_SEED: {
      username: data.ADMIN_DEFAULT_USERNAME,
      email: data.ADMIN_DEFAULT_EMAIL,
      password: data.ADMIN_DEFAULT_PASSWORD,
    },
  });
};

export const env = parseEnvironment();
export default env;