import bcrypt from 'bcrypt';

/**
 * Fator de custo (salt rounds) padrão para hashing com bcrypt.
 * 12 rounds garante elevada resistência a ataques de força bruta e rainbow tables.
 */
const SALT_ROUNDS = 12;

/**
 * Gera o hash criptográfico seguro de uma palavra-passe em texto limpo.
 * 
 * @param {string} plainPassword - Palavra-passe enviada pelo utilizador
 * @param {number} [saltRounds=12] - Custo computacional de geração de salt
 * @returns {Promise<string>} Hash bcrypt pronto para persistência no PostgreSQL
 */
export const hashPassword = async (plainPassword, saltRounds = SALT_ROUNDS) => {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('A palavra-passe deve ser uma cadeia de texto válida.');
  }

  const salt = await bcrypt.genSalt(saltRounds);
  const hash = await bcrypt.hash(plainPassword, salt);
  return hash;
};

/**
 * Compara uma palavra-passe em texto limpo com o hash persistido no banco de dados.
 * 
 * @param {string} plainPassword - Palavra-passe fornecida no formulário de login
 * @param {string} hashedPassword - Hash bcrypt armazenado em users.password_hash
 * @returns {Promise<boolean>} Verdadeiro se coincidir, falso caso contrário
 */
export const comparePassword = async (plainPassword, hashedPassword) => {
  if (!plainPassword || !hashedPassword) {
    return false;
  }

  try {
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    console.error('[PASSWORD UTIL ERROR] Falha ao comparar hashes:', error.message);
    return false;
  }
};

/**
 * Analisa a robustez de uma palavra-passe candidata.
 * 
 * @param {string} password
 * @returns {{ isValid: boolean, score: number, errors: string[] }}
 */
export const evaluatePasswordStrength = (password) => {
  const errors = [];
  let score = 0;

  if (!password || typeof password !== 'string') {
    return { isValid: false, score: 0, errors: ['Palavra-passe inválida.'] };
  }

  if (password.length >= 8) {
    score += 1;
  } else {
    errors.push('Deve ter pelo menos 8 caracteres.');
  }

  if (password.length >= 12) {
    score += 1;
  }

  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    errors.push('Deve conter pelo menos uma letra minúscula.');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    errors.push('Deve conter pelo menos uma letra maiúscula.');
  }

  if (/\d/.test(password)) {
    score += 1;
  } else {
    errors.push('Deve conter pelo menos um dígito numérico.');
  }

  if (/[@$!%*?&_\-#]/.test(password)) {
    score += 1;
  } else {
    errors.push('Deve conter pelo menos um caractere especial (@$!%*?&_-#).');
  }

  return {
    isValid: errors.length === 0,
    score, // 0 a 6
    errors,
  };
};

export default {
  hashPassword,
  comparePassword,
  evaluatePasswordStrength,
};