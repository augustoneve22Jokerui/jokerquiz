import { withTransaction } from '../database/connection.js';
import { userRepository } from '../repositories/user.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { hashPassword, comparePassword } from '../utils/password.util.js';
import { generateRandomToken, hashToken } from '../utils/token.util.js';
import { addHours } from '../utils/date.util.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.util.js';

/**
 * Serviço de Negócio de Autenticação, Registo e Gestão de Credenciais.
 * Orquestra transações atómicas para garantir consistência entre credenciais e perfis.
 */
export const authService = {
  /**
   * Executa o registo atómico de um novo competidor:
   * 1. Valida unicidade de username e email;
   * 2. Hasheia a palavra-passe com bcrypt (12 salt rounds);
   * 3. Cria o utilizador na tabela `users`;
   * 4. Associa o papel 'PLAYER';
   * 5. Inicializa o registo em `user_profiles`.
   * 
   * @param {Object} data
   * @param {string} data.username
   * @param {string} data.displayName
   * @param {string} data.email
   * @param {string} data.password
   * @returns {Promise<Object>} Dados normalizados para sessão e visualização
   */
  register: async ({ username, displayName, email, password }) => {
    // 1. Verificação prévia de unicidade
    const existingEmail = await userRepository.findByEmail(email);
    if (existingEmail) {
      throw new AppError(
        'Este endereço de email já se encontra associado a uma conta no ecossistema.',
        400,
        'EMAIL_ALREADY_EXISTS'
      );
    }

    const existingUsername = await userRepository.findByUsername(username);
    if (existingUsername) {
      throw new AppError(
        'Este nome de utilizador já está em uso por outro competidor.',
        400,
        'USERNAME_ALREADY_EXISTS'
      );
    }

    // 2. Transacção ACID completa no PostgreSQL Neon
    return await withTransaction(async (client) => {
      const passwordHash = await hashPassword(password);

      // Criação das credenciais
      const newUser = await userRepository.create(
        {
          username,
          email,
          passwordHash,
          isActive: true,
          isVerified: false,
        },
        client
      );

      // Concessão do papel padrão de jogador
      await userRepository.assignRole(newUser.id, 'PLAYER', client);

      // Criação do perfil competitivo
      const newProfile = await profileRepository.create(
        {
          userId: newUser.id,
          displayName,
          countryCode: 'AO',
        },
        client
      );

      logger.info(`Novo utilizador registado com sucesso: ${username} (${newUser.id})`);

      return {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        displayName: newProfile.display_name,
        avatarUrl: newProfile.avatar_url,
        rankTier: newProfile.rank_tier,
        level: newProfile.level,
        xp: newProfile.xp,
        role: 'PLAYER',
        roles: ['PLAYER'],
        permissions: [],
      };
    });
  },

  /**
   * Autentica um jogador validando credenciais e estado da conta.
   * 
   * @param {Object} credentials
   * @param {string} credentials.login - Email ou Username
   * @param {string} credentials.password
   * @param {string} [credentials.ipAddress]
   * @returns {Promise<Object>} Objecto sanitizado pronto para serialização em sessão
   */
  login: async ({ login, password, ipAddress = null }) => {
    const user = await userRepository.findByLogin(login);

    if (!user) {
      logger.warn(`Tentativa de autenticação com credencial inexistente: ${login}`, { ipAddress });
      throw new AppError(
        'Credenciais inválidas. Verifique os dados introduzidos e tente novamente.',
        401,
        'INVALID_CREDENTIALS'
      );
    }

    if (!user.is_active) {
      logger.warn(`Tentativa de acesso a conta suspensa: ${user.username}`, { userId: user.id });
      throw new AppError(
        'Esta conta encontra-se temporariamente suspensa pelas políticas da plataforma. Contacte o suporte.',
        403,
        'ACCOUNT_SUSPENDED'
      );
    }

    // Validação criptográfica do hash bcrypt
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      logger.warn(`Falha na verificação de palavra-passe para o utilizador: ${user.username}`, { ipAddress });
      throw new AppError(
        'Credenciais inválidas. Verifique os dados introduzidos e tente novamente.',
        401,
        'INVALID_CREDENTIALS'
      );
    }

    // Carrega dados de perfil e permissões associadas
    const [profile, detailedUser] = await Promise.all([
      profileRepository.findByUserId(user.id),
      userRepository.findById(user.id),
      userRepository.updateLastLogin(user.id),
    ]);

    const primaryRole = detailedUser?.roles?.includes('ADMIN')
      ? 'ADMIN'
      : detailedUser?.roles?.includes('MODERATOR')
      ? 'MODERATOR'
      : 'PLAYER';

    logger.info(`Utilizador autenticado com sucesso: ${user.username}`, { userId: user.id, role: primaryRole });

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: profile?.display_name || user.username,
      avatarUrl: profile?.avatar_url || '/assets/images/placeholders/default-avatar.png',
      rankTier: profile?.rank_tier || 'ESTUDANTE_ACADEMIA',
      level: profile?.level || 1,
      xp: profile?.xp || 0,
      role: primaryRole,
      roles: detailedUser?.roles || ['PLAYER'],
      permissions: detailedUser?.permissions || [],
    };
  },

  /**
   * Inicia o fluxo de recuperação de palavra-passe com geração de token seguro.
   * Não expõe se o email existe para prevenir enumeração de contas.
   * 
   * @param {string} email
   * @returns {Promise<{ success: boolean, token?: string, email: string }>}
   */
  requestPasswordReset: async (email) => {
    const user = await userRepository.findByEmail(email);

    if (!user || !user.is_active) {
      // Retorna sucesso aparente para mitigar enumeração maliciosa de contas cadastradas
      return { success: true, email };
    }

    // Gera token bruto de alta entropia e guarda apenas o seu hash SHA-256 no banco
    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = addHours(new Date(), 1); // Válido por 1 hora

    await userRepository.setResetPasswordToken(user.id, tokenHash, expiresAt);

    logger.info(`Token de recuperação gerado para o utilizador: ${user.username}`);

    return {
      success: true,
      token: rawToken, // Devolvido para envio via serviço de notificação / email
      email: user.email,
    };
  },

  /**
   * Conclui a redefinição de palavra-passe através da validação do token hash.
   * 
   * @param {string} rawToken - Token recebido no link de recuperação
   * @param {string} newPassword - Nova palavra-passe
   * @returns {Promise<boolean>}
   */
  resetPassword: async (rawToken, newPassword) => {
    const tokenHash = hashToken(rawToken);
    const user = await userRepository.findByResetPasswordToken(tokenHash);

    if (!user) {
      throw new AppError(
        'O link de recuperação de palavra-passe é inválido ou já expirou. Solicite um novo link.',
        400,
        'INVALID_OR_EXPIRED_RESET_TOKEN'
      );
    }

    const newPasswordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(user.id, newPasswordHash);

    logger.info(`Palavra-passe redefinida com sucesso para o utilizador: ${user.username}`);
    return true;
  },

  /**
   * Altera a palavra-passe de um utilizador autenticado validando a senha anterior.
   * 
   * @param {string} userId - UUID
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<boolean>}
   */
  changePassword: async (userId, currentPassword, newPassword) => {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('Utilizador não encontrado no sistema.', 404, 'USER_NOT_FOUND');
    }

    // Recarrega credenciais completas para obter o hash
    const userCredentials = await userRepository.findByLogin(user.username);
    const isCurrentValid = await comparePassword(currentPassword, userCredentials.password_hash);

    if (!isCurrentValid) {
      throw new AppError('A palavra-passe actual introduzida está incorrecta.', 400, 'INCORRECT_PASSWORD');
    }

    const newPasswordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(userId, newPasswordHash);

    logger.info(`Palavra-passe alterada pelo próprio utilizador: ${user.username}`);
    return true;
  },
};

export default authService;