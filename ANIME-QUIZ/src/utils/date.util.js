/**
 * Utilitários para formatação temporal, cálculo de prazos de torneios,
 * contagens decrescentes e identificadores para snapshots de rankings.
 */

const DEFAULT_LOCALE = 'pt-AO';
const DEFAULT_TIMEZONE = 'Africa/Luanda';

/**
 * Converte qualquer entrada válida (Date, string ISO, timestamp) num objecto Date verificado.
 * 
 * @param {Date | string | number} dateInput
 * @returns {Date}
 */
const toDate = (dateInput) => {
  if (dateInput instanceof Date) {
    return dateInput;
  }
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    throw new Error(`Data inválida fornecida: ${dateInput}`);
  }
  return date;
};

/**
 * Formata uma data no padrão descritivo oficial de Angola (ex: "01 de Novembro de 2026").
 * 
 * @param {Date | string | number} dateInput
 * @param {string} [locale='pt-AO']
 * @returns {string}
 */
export const formatDate = (dateInput, locale = DEFAULT_LOCALE) => {
  const date = toDate(dateInput);
  return new Intl.DateTimeFormat(locale, {
    timeZone: DEFAULT_TIMEZONE,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

/**
 * Formata data e hora de forma compacta (ex: "01/11/2026 às 14:30").
 * 
 * @param {Date | string | number} dateInput
 * @param {string} [locale='pt-AO']
 * @returns {string}
 */
export const formatDateTime = (dateInput, locale = DEFAULT_LOCALE) => {
  const date = toDate(dateInput);
  const formattedDate = new Intl.DateTimeFormat(locale, {
    timeZone: DEFAULT_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);

  const formattedTime = new Intl.DateTimeFormat(locale, {
    timeZone: DEFAULT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${formattedDate} às ${formattedTime}`;
};

/**
 * Formata tempo relativo em linguagem humana (ex: "há 5 minutos", "em 2 horas").
 * 
 * @param {Date | string | number} dateInput
 * @param {string} [locale='pt-AO']
 * @returns {string}
 */
export const formatRelativeTime = (dateInput, locale = DEFAULT_LOCALE) => {
  const date = toDate(dateInput);
  const now = new Date();
  const diffInSeconds = Math.round((date.getTime() - now.getTime()) / 1000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const cutoffs = [
    { unit: 'year', seconds: 31536000 },
    { unit: 'month', seconds: 2592000 },
    { unit: 'week', seconds: 604800 },
    { unit: 'day', seconds: 86400 },
    { unit: 'hour', seconds: 3600 },
    { unit: 'minute', seconds: 60 },
    { unit: 'second', seconds: 1 },
  ];

  for (const { unit, seconds } of cutoffs) {
    if (Math.abs(diffInSeconds) >= seconds || unit === 'second') {
      const value = Math.round(diffInSeconds / seconds);
      return rtf.format(value, unit);
    }
  }

  return 'agora mesmo';
};

/**
 * Adiciona minutos a uma determinada data.
 * 
 * @param {Date | string | number} dateInput
 * @param {number} minutes
 * @returns {Date}
 */
export const addMinutes = (dateInput, minutes) => {
  const date = new Date(toDate(dateInput));
  date.setMinutes(date.getMinutes() + minutes);
  return date;
};

/**
 * Adiciona horas a uma determinada data.
 * 
 * @param {Date | string | number} dateInput
 * @param {number} hours
 * @returns {Date}
 */
export const addHours = (dateInput, hours) => {
  const date = new Date(toDate(dateInput));
  date.setHours(date.getHours() + hours);
  return date;
};

/**
 * Adiciona dias a uma determinada data.
 * 
 * @param {Date | string | number} dateInput
 * @param {number} days
 * @returns {Date}
 */
export const addDays = (dateInput, days) => {
  const date = new Date(toDate(dateInput));
  date.setDate(date.getDate() + days);
  return date;
};

/**
 * Verifica se uma data já expirou em relação ao instante actual.
 * 
 * @param {Date | string | number} dateInput
 * @returns {boolean}
 */
export const isExpired = (dateInput) => {
  const date = toDate(dateInput);
  return date.getTime() < Date.now();
};

/**
 * Gera o identificador da semana ISO actual para o ranking semanal (ex: '2026-W44').
 * 
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
export const getIsoWeekIdentifier = (d = new Date()) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // O dia 4 de Janeiro pertence sempre à primeira semana do ano na ISO 8601
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekStr = weekNo < 10 ? `0${weekNo}` : `${weekNo}`;
  return `${date.getUTCFullYear()}-W${weekStr}`;
};

/**
 * Gera o identificador mensal actual para o ranking mensal (ex: '2026-11').
 * 
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
export const getIsoMonthIdentifier = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Formata segundos num formato de cronómetro desportivo (ex: "02:45" ou "01:15:30").
 * 
 * @param {number} totalSeconds
 * @returns {string}
 */
export const formatDurationSeconds = (totalSeconds) => {
  const total = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const pad = (num) => String(num).padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
};

export default {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  addMinutes,
  addHours,
  addDays,
  isExpired,
  getIsoWeekIdentifier,
  getIsoMonthIdentifier,
  formatDurationSeconds,
};