import { query } from '../database/connection.js';

/**
 * Repositório de Acesso a Dados de Utilizadores (Users e RBAC).
 * Implementado através de SQL puro parametrizado, sem ORMs, com Prepared Statements nativos.
 */
export const userRepository = {
  /**
   * Localiza um utilizador pelo seu endereço de email (insensível a maiúsculas).
   * Inclui papéis (roles) associados.
   * 
   * @param {string} email
   * @param {import('pg').PoolClient} [client] - Cliente opcional para operações em transacção
   * @returns {Promise<Object|null>}
   */
  findByEmail: async (email, client = null) => {
    const sql = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.is_active,
        u.is_verified,
        u.verification_token,
        u.reset_password_token,
        u.reset_password_expires_at,
        u.last_login_at,
        u.created_at,
        COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY['PLAYER']::VARCHAR[]) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE LOWER(u.email) = LOWER($1)
      GROUP BY u.id;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [email]);
    return rows[0] || null;
  },

  /**
   * Localiza um utilizador pelo seu nome de utilizador (username).
   * 
   * @param {string} username
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findByUsername: async (username, client = null) => {
    const sql = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.is_active,
        u.is_verified,
        u.verification_token,
        u.reset_password_token,
        u.reset_password_expires_at,
        u.last_login_at,
        u.created_at,
        COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY['PLAYER']::VARCHAR[]) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE LOWER(u.username) = LOWER($1)
      GROUP BY u.id;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [username]);
    return rows[0] || null;
  },

  /**
   * Localiza um utilizador por credencial mista (username OU email) para o formulário de login.
   * 
   * @param {string} login - Email ou username
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findByLogin: async (login, client = null) => {
    const sql = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.is_active,
        u.is_verified,
        u.last_login_at,
        u.created_at,
        COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY['PLAYER']::VARCHAR[]) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE LOWER(u.username) = LOWER($1) OR LOWER(u.email) = LOWER($1)
      GROUP BY u.id;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [login]);
    return rows[0] || null;
  },

  /**
   * Localiza um utilizador pelo seu UUID primário, agregando papéis e permissões calculadas.
   * 
   * @param {string} id - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findById: async (id, client = null) => {
    const sql = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.is_active,
        u.is_verified,
        u.last_login_at,
        u.created_at,
        COALESCE(ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY['PLAYER']::VARCHAR[]) AS roles,
        COALESCE(ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), ARRAY[]::VARCHAR[]) AS permissions
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $1
      GROUP BY u.id;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Cria um novo utilizador na tabela users.
   * 
   * @param {Object} data
   * @param {string} data.username
   * @param {string} data.email
   * @param {string} data.passwordHash
   * @param {boolean} [data.isActive=true]
   * @param {boolean} [data.isVerified=false]
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object>} Registo criado com id, username e email
   */
  create: async ({ username, email, passwordHash, isActive = true, isVerified = false }, client = null) => {
    const sql = `
      INSERT INTO users (username, email, password_hash, is_active, is_verified)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, is_active, is_verified, created_at;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [username, email, passwordHash, isActive, isVerified]);
    return rows[0];
  },

  /**
   * Atribui um papel (role) ao utilizador na tabela associativa user_roles.
   * 
   * @param {string} userId - UUID
   * @param {string} roleName - Nome do papel (ex: 'PLAYER', 'ADMIN')
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  assignRole: async (userId, roleName, client = null) => {
    const sql = `
      INSERT INTO user_roles (user_id, role_id)
      SELECT $1, r.id FROM roles r WHERE r.name = $2
      ON CONFLICT (user_id, role_id) DO NOTHING;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [userId, roleName]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Actualiza a data e hora do último acesso do utilizador.
   * 
   * @param {string} userId - UUID
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<void>}
   */
  updateLastLogin: async (userId, client = null) => {
    const sql = `
      UPDATE users 
      SET last_login_at = CURRENT_TIMESTAMP 
      WHERE id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    await executor(sql, [userId]);
  },

  /**
   * Grava o token de redefinição de palavra-passe com prazo de validade.
   * 
   * @param {string} userId - UUID
   * @param {string} tokenHash - Hash SHA-256 do token
   * @param {Date} expiresAt - Data de expiração
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  setResetPasswordToken: async (userId, tokenHash, expiresAt, client = null) => {
    const sql = `
      UPDATE users
      SET reset_password_token = $2, reset_password_expires_at = $3
      WHERE id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [userId, tokenHash, expiresAt]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Localiza utilizador por token de redefinição de senha ainda não expirado.
   * 
   * @param {string} tokenHash - Hash SHA-256
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<Object|null>}
   */
  findByResetPasswordToken: async (tokenHash, client = null) => {
    const sql = `
      SELECT id, username, email, reset_password_expires_at
      FROM users
      WHERE reset_password_token = $1 
        AND reset_password_expires_at > CURRENT_TIMESTAMP
        AND is_active = TRUE;
    `;
    const executor = client ? client.query.bind(client) : query;
    const { rows } = await executor(sql, [tokenHash]);
    return rows[0] || null;
  },

  /**
   * Actualiza a palavra-passe do utilizador e limpa os campos de token de recuperação.
   * 
   * @param {string} userId - UUID
   * @param {string} newPasswordHash - Novo hash bcrypt
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  updatePassword: async (userId, newPasswordHash, client = null) => {
    const sql = `
      UPDATE users
      SET 
        password_hash = $2,
        reset_password_token = NULL,
        reset_password_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [userId, newPasswordHash]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Actualiza o estado de activação da conta (Activo / Suspenso).
   * 
   * @param {string} userId - UUID
   * @param {boolean} isActive
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<boolean>}
   */
  updateStatus: async (userId, isActive, client = null) => {
    const sql = `
      UPDATE users
      SET is_active = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    const executor = client ? client.query.bind(client) : query;
    const result = await executor(sql, [userId, isActive]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Lista utilizadores com paginação e busca para o painel administrativo.
   * 
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=15]
   * @param {string} [options.search='']
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<{ users: Array<Object>, total: number, page: number, totalPages: number }>}
   */
  findPaginated: async ({ page = 1, limit = 15, search = '' }, client = null) => {
    const offset = (page - 1) * limit;
    const searchTerm = `%${search.trim().toLowerCase()}%`;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM users u
      WHERE ($1 = '%%' OR LOWER(u.username) LIKE $1 OR LOWER(u.email) LIKE $1);
    `;

    const dataSql = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.is_active,
        u.is_verified,
        u.last_login_at,
        u.created_at,
        p.display_name,
        p.avatar_url,
        p.rank_tier,
        p.level,
        p.xp,
        COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY['PLAYER']::VARCHAR[]) AS roles
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE ($1 = '%%' OR LOWER(u.username) LIKE $1 OR LOWER(u.email) LIKE $1)
      GROUP BY u.id, p.id
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const executor = client ? client.query.bind(client) : query;

    const [countResult, dataResult] = await Promise.all([
      executor(countSql, [searchTerm]),
      executor(dataSql, [searchTerm, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      users: dataResult.rows,
      total,
      page,
      totalPages,
    };
  },
};

export default userRepository;