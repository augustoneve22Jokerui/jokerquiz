import bcrypt from 'bcrypt';
import { env } from '../../config/environment.js';

/**
 * Seed inicial: Funções (Roles), Permissões do Sistema, Utilizador Administrador Master e Definições Base.
 * 
 * @param {import('pg').PoolClient} client - Cliente transacional da conexão PostgreSQL Neon
 */
export const runSeed = async (client) => {
  console.log('[SEED:001] A semear papéis (roles) e permissões de sistema...');

  // 1. Definição dos Papéis Base
  const roles = [
    { name: 'ADMIN', description: 'Acesso total irrestrito ao sistema e painel de administração', is_system: true },
    { name: 'MODERATOR', description: 'Moderação de partidas, aprovação de pagamentos AOA e gestão de denúncias', is_system: true },
    { name: 'PLAYER', description: 'Jogador padrão com acesso a treino, ranqueado, salas e torneios', is_system: true },
  ];

  for (const role of roles) {
    await client.query(
      `INSERT INTO roles (name, description, is_system)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET
         description = EXCLUDED.description,
         is_system = EXCLUDED.is_system;`,
      [role.name, role.description, role.is_system]
    );
  }

  // 2. Definição das Permissões Granulares
  const permissions = [
    { name: 'manage_tournaments', module: 'tournaments', description: 'Criar, editar e gerir o ciclo de vida de torneios' },
    { name: 'view_tournaments', module: 'tournaments', description: 'Visualizar lista e estatísticas de torneios' },
    { name: 'review_payments', module: 'payments', description: 'Visualizar comprovativos bancários enviados' },
    { name: 'approve_payments', module: 'payments', description: 'Aprovar inscrições e pagamentos manuais em AOA' },
    { name: 'reject_payments', module: 'payments', description: 'Rejeitar comprovativos inválidos ou fraudulentos' },
    { name: 'manage_questions', module: 'quiz', description: 'Criar, aprovar e editar perguntas e respostas do quiz' },
    { name: 'manage_categories', module: 'quiz', description: 'Criar e editar categorias e animes' },
    { name: 'moderate_chat', module: 'chat', description: 'Apagar mensagens e silenciar jogadores no chat' },
    { name: 'mute_users', module: 'chat', description: 'Aplicar sanções de silêncio a jogadores tóxicos' },
    { name: 'view_audit_logs', module: 'admin', description: 'Aceder aos registos de auditoria e operações de administradores' },
    { name: 'manage_users', module: 'admin', description: 'Suspender, banir ou alterar privilégios de utilizadores' },
    { name: 'manage_settings', module: 'admin', description: 'Modificar parâmetros operacionais do sistema' },
  ];

  for (const perm of permissions) {
    await client.query(
      `INSERT INTO permissions (name, module, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET
         description = EXCLUDED.description,
         module = EXCLUDED.module;`,
      [perm.name, perm.module, perm.description]
    );
  }

  // 3. Associação de Permissões ao Administrador e Moderador
  const { rows: dbRoles } = await client.query('SELECT id, name FROM roles;');
  const { rows: dbPerms } = await client.query('SELECT id, name FROM permissions;');

  const adminRole = dbRoles.find((r) => r.name === 'ADMIN');
  const modRole = dbRoles.find((r) => r.name === 'MODERATOR');

  // ADMIN recebe todas as permissões do sistema
  if (adminRole) {
    for (const perm of dbPerms) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT (role_id, permission_id) DO NOTHING;`,
        [adminRole.id, perm.id]
      );
    }
  }

  // MODERATOR recebe permissões operacionais de pagamentos, chat e moderação
  if (modRole) {
    const modPermNames = [
      'view_tournaments',
      'review_payments',
      'approve_payments',
      'reject_payments',
      'moderate_chat',
      'mute_users',
      'view_audit_logs',
    ];

    const targetPerms = dbPerms.filter((p) => modPermNames.includes(p.name));
    for (const perm of targetPerms) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT (role_id, permission_id) DO NOTHING;`,
        [modRole.id, perm.id]
      );
    }
  }

  // 4. Criação da Conta do Administrador Master (Hokage)
  console.log('[SEED:001] A semear conta mestre do Administrador...');
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(env.ADMIN_SEED.password, saltRounds);

  const { rows: userRows } = await client.query(
    `INSERT INTO users (username, email, password_hash, is_active, is_verified)
     VALUES ($1, $2, $3, TRUE, TRUE)
     ON CONFLICT (username) DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       is_active = TRUE,
       is_verified = TRUE
     RETURNING id;`,
    [env.ADMIN_SEED.username, env.ADMIN_SEED.email, passwordHash]
  );

  const adminUserId = userRows[0].id;

  // Criação ou actualização do perfil competitivo do Administrador Master
  await client.query(
    `INSERT INTO user_profiles (user_id, display_name, bio, rank_tier, country_code)
     VALUES ($1, 'Hokage Master Admin', 'Administrador e guardião do ecossistema competitivo Anime Quiz.', 'HOKAGE', 'AO')
     ON CONFLICT (user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       rank_tier = 'HOKAGE';`,
    [adminUserId]
  );

  // Atribuição do papel ADMIN ao utilizador
  if (adminRole) {
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING;`,
      [adminUserId, adminRole.id]
    );
  }

  // 5. Definições do Sistema Padrão (System Settings)
  const initialSettings = [
    { key: 'platform_maintenance_mode', value: 'false', value_type: 'BOOLEAN', description: 'Activa o modo de manutenção global da aplicação', is_public: true },
    { key: 'registration_enabled', value: 'true', value_type: 'BOOLEAN', description: 'Permite novos registos de jogadores na plataforma', is_public: true },
    { key: 'bank_account_name', value: env.BANK.accountName, value_type: 'STRING', description: 'Nome do titular da conta bancária oficial', is_public: true },
    { key: 'bank_name', value: env.BANK.name, value_type: 'STRING', description: 'Nome da instituição bancária', is_public: true },
    { key: 'bank_iban', value: env.BANK.iban, value_type: 'STRING', description: 'IBAN oficial para transferências bancárias em Angola', is_public: true },
    { key: 'multicaixa_express_phone', value: env.BANK.multicaixaPhone, value_type: 'STRING', description: 'Número telefónico oficial do Multicaixa Express', is_public: true },
    { key: 'default_currency', value: env.BANK.currency, value_type: 'STRING', description: 'Moeda padrão de operação do ecossistema', is_public: true },
    { key: 'global_chat_enabled', value: 'true', value_type: 'BOOLEAN', description: 'Habilita o canal de chat global para todos os jogadores', is_public: true },
  ];

  for (const setting of initialSettings) {
    await client.query(
      `INSERT INTO system_settings (key, value, value_type, description, is_public)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         value_type = EXCLUDED.value_type,
         description = EXCLUDED.description,
         is_public = EXCLUDED.is_public;`,
      [setting.key, setting.value, setting.value_type, setting.description, setting.is_public]
    );
  }

  console.log('[SEED:001] Concluído com sucesso.');
};

export default runSeed;