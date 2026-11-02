import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import engine from 'ejs-mate';
import { env } from './config/environment.js';
import {
  cookieParserMiddleware,
  helmetMiddleware,
  corsMiddleware,
} from './config/security.js';
import { sessionMiddleware } from './config/session.js';
import { globalLimiter } from './middlewares/rate-limit.middleware.js';
import { viewLocalsMiddleware } from './middlewares/view-locals.middleware.js';
import {
  notFoundHandler,
  errorHandler,
} from './middlewares/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Instanciação e configuração central da aplicação Express 5.
 */
const app = express();

// 1. Configuração de Proxy Reverso (Essencial para balanceadores de carga do Render e HTTPS)
app.set('trust proxy', 1);

// 2. Motor de Visualização (EJS com suporte a layouts e blocos ejs-mate)
app.engine('ejs', engine);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 3. Ficheiros Públicos Estáticos (CSS, Vanilla JS do cliente, imagens e fontes)
// Nota: O directório storage/uploads permanece privado e fora do mapeamento público
app.use(express.static(path.join(__dirname, '../public')));

// 4. Parsers de Requisições HTTP
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 5. Camada de Segurança, Cookies e Sessão Persistente no PostgreSQL
app.use(cookieParserMiddleware);
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(sessionMiddleware);

// 6. Defesa contra Força Bruta e Injeção de Contexto Global em Views EJS
app.use(globalLimiter);
app.use(viewLocalsMiddleware);

// 7. Rota de Verificação de Saúde do Sistema (Health Check para Render e Monitorização)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// 8. Rota Base Temporária (Garante resposta limpa enquanto as páginas completas de EJS são compiladas)
app.get('/', (req, res, next) => {
  res.render('pages/public/index', {
    title: 'Anime Quiz — Ecossistema Competitivo',
  }, (renderError, html) => {
    if (renderError) {
      // Fallback gracioso de desenvolvimento/arranque antes da geração da view index.ejs
      return res.status(200).type('html').send(`
        <!DOCTYPE html>
        <html lang="pt">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${env.APP_NAME} — Fundação Pronta</title>
            <style>
              body { background: #0b0e14; color: #f8fafc; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
              .box { background: #151a23; border: 1px solid #00f2fe; border-radius: 12px; padding: 40px; text-align: center; max-width: 500px; box-shadow: 0 0 25px rgba(0, 242, 254, 0.2); }
              h1 { color: #00f2fe; margin-bottom: 12px; font-size: 1.8rem; }
              p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; }
              .badge { display: inline-block; background: #ff0055; color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; margin-top: 16px; }
            </style>
          </head>
          <body>
            <div class="box">
              <h1>${env.APP_NAME}</h1>
              <p>Servidor Express 5 operacional com protecção de segurança, sessões no PostgreSQL Neon e motor EJS-Mate configurado.</p>
              <div class="badge">FASE 2 — FUNDAÇÃO OPERACIONAL</div>
            </div>
          </body>
        </html>
      `);
    }
    return res.send(html);
  });
});

// 9. Manipulação de Rota Não Encontrada e Gestão Centralizada de Erros
app.use(notFoundHandler);
app.use(errorHandler);

export default app;