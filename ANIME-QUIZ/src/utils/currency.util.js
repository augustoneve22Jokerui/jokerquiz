import { env } from '../config/environment.js';

const DEFAULT_CURRENCY = env.BANK.currency || 'AOA';
const LOCALE_AO = 'pt-AO';

/**
 * Arredonda um valor monetário para exactamente duas casas decimais,
 * evitando discrepâncias inerentes à aritmética de ponto flutuante.
 * 
 * @param {number | string} amount
 * @returns {number}
 */
export const roundCurrency = (amount) => {
  const numeric = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
};

/**
 * Formata um valor numérico em moeda nacional angolana (Kwanzas - AOA).
 * Exemplo: 25000 -> "25.000,00 AOA" ou "25.000 AOA".
 * 
 * @param {number | string} amount - Montante numérico ou representação em string
 * @param {boolean} [showDecimals=false] - Se true, inclui sempre cêntimos (,00)
 * @returns {string} Valor formatado com símbolo da moeda
 */
export const formatAOA = (amount, showDecimals = false) => {
  const value = roundCurrency(amount);

  const formatter = new Intl.NumberFormat(LOCALE_AO, {
    style: 'decimal',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });

  return `${formatter.format(value)} ${DEFAULT_CURRENCY}`;
};

/**
 * Converte uma entrada de texto formatada pelo utilizador em valor numérico decimal seguro
 * pronto para persistência na coluna NUMERIC(12, 2) do PostgreSQL.
 * Trata separadores de milhares angolanos (pontos ou espaços) e vírgula decimal.
 * 
 * @param {string | number} rawInput - Ex: "15.000,50", "15 000", "5000"
 * @returns {number} Número decimal limpo
 */
export const parseAOA = (rawInput) => {
  if (typeof rawInput === 'number') {
    return roundCurrency(rawInput);
  }

  if (!rawInput || typeof rawInput !== 'string') {
    return 0;
  }

  // Remove espaços, símbolos AOA e substitui separadores de milhar
  let cleaned = rawInput
    .replace(/[^\d,.-]/g, '')
    .replace(/\s+/g, '')
    .trim();

  // Caso contenha vírgula como separador decimal, converte para ponto
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }

  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : roundCurrency(result);
};

/**
 * Calcula a divisão matemática do bolo de prémios (Prize Pool) de um torneio,
 * deduzindo a comissão operacional da plataforma sem perdas por arredondamento.
 * 
 * @param {number} totalCollected - Total arrecadado com as taxas de inscrição
 * @param {number} [platformFeePercent=10] - Percentagem de retenção da plataforma (ex: 10%)
 * @returns {{ platformFee: number, netPrizePool: number }}
 */
export const calculateTournamentPrizePool = (totalCollected, platformFeePercent = 10) => {
  const total = Math.max(0, roundCurrency(totalCollected));
  const feeRate = Math.max(0, Math.min(100, platformFeePercent)) / 100;

  const platformFee = roundCurrency(total * feeRate);
  const netPrizePool = roundCurrency(total - platformFee);

  return {
    platformFee,
    netPrizePool,
  };
};

/**
 * Calcula a repartição padrão de prémios para o pódio competitivo de torneios eliminatórios.
 * 1º Lugar: 60% | 2º Lugar: 30% | 3º Lugar: 10%
 * 
 * @param {number} netPrizePool - Montante total líquido para premiação
 * @returns {{ firstPlace: number, secondPlace: number, thirdPlace: number }}
 */
export const calculatePodiumDistribution = (netPrizePool) => {
  const pool = Math.max(0, roundCurrency(netPrizePool));

  const firstPlace = roundCurrency(pool * 0.60);
  const secondPlace = roundCurrency(pool * 0.30);
  // O 3º lugar absorve o saldo remanescente exacto para evitar centavos órfãos
  const thirdPlace = roundCurrency(pool - (firstPlace + secondPlace));

  return {
    firstPlace,
    secondPlace,
    thirdPlace: Math.max(0, thirdPlace),
  };
};

export default {
  roundCurrency,
  formatAOA,
  parseAOA,
  calculateTournamentPrizePool,
  calculatePodiumDistribution,
};