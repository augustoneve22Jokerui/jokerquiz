import crypto from 'node:crypto';

/**
 * Conjunto de caracteres não ambíguos para códigos curtos de salas e convites.
 * Exclui deliberadamente caracteres visualmente confusos como '0', 'O', '1' e 'I'.
 */
const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Gera um token aleatório criptograficamente seguro em formato hexadecimal.
 * Utilizado para redefinição de palavra-passe, verificação de contas e links de convite.
 * 
 * @param {number} [bytes=32] - Quantidade de bytes de entropia
 * @returns {string} String hexadecimal aleatória
 */
export const generateRandomToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Cria o hash SHA-256 de um token antes de o persistir no banco de dados.
 * Garante que mesmo com acesso à tabela `users`, tokens de redefinição de senha
 * não possam ser utilizados por atacantes sem o valor original enviado por email.
 * 
 * @param {string} token - Token original em texto limpo
 * @returns {string} Hash hexadecimal SHA-256
 */
export const hashToken = (token) => {
  if (!token || typeof token !== 'string') {
    throw new Error('Token inválido para operação de hash.');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Gera um código curto alfanumérico para entrada rápida em salas multiplayer.
 * Exemplo de formato: 'AKAT99', 'SHIN88'.
 * 
 * @param {number} [length=6] - Comprimento do código (entre 4 e 8 caracteres)
 * @returns {string} Código em maiúsculas sem caracteres ambíguos
 */
export const generateRoomCode = (length = 6) => {
  const codeLength = Math.max(4, Math.min(8, length));
  const bytes = crypto.randomBytes(codeLength);
  let result = '';

  for (let i = 0; i < codeLength; i++) {
    const randomIndex = bytes[i] % ROOM_CODE_ALPHABET.length;
    result += ROOM_CODE_ALPHABET[randomIndex];
  }

  return result;
};

/**
 * Gera um código de referência único e legível para pagamentos em Angola (AOA).
 * Exemplo: 'PAY-202611-A8F2K'
 * 
 * @param {string} [prefix='PAY'] - Prefixo identificador da transacção
 * @returns {string} Código formatado de pagamento
 */
export const generatePaymentReference = (prefix = 'PAY') => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${dateStr}-${randomSuffix}`;
};

/**
 * Gera um UUID versão 4 criptograficamente seguro.
 * 
 * @returns {string} UUIDv4
 */
export const generateSecureUuid = () => {
  return crypto.randomUUID();
};

export default {
  generateRandomToken,
  hashToken,
  generateRoomCode,
  generatePaymentReference,
  generateSecureUuid,
};