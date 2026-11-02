/**
 * Constantes de balanceamento competitivo do ecossistema Anime Quiz.
 */
const DIFFICULTY_WEIGHTS = {
  INICIANTE: { pointsMultiplier: 1.0, xpMultiplier: 1.0 },
  MEDIO: { pointsMultiplier: 1.5, xpMultiplier: 1.4 },
  PROFISSIONAL: { pointsMultiplier: 2.2, xpMultiplier: 2.0 },
  HOKAGE: { pointsMultiplier: 3.5, xpMultiplier: 3.2 },
};

const RANK_TIERS = [
  { tier: 'HOKAGE', minLevel: 50, title: 'Hokage Lendário' },
  { tier: 'JONIN', minLevel: 35, title: 'Jonin Especial' },
  { tier: 'CHUNIN', minLevel: 20, title: 'Chunin Veterano' },
  { tier: 'GENIN', minLevel: 10, title: 'Genin Promissor' },
  { tier: 'ESTUDANTE_ACADEMIA', minLevel: 1, title: 'Estudante da Academia' },
];

/**
 * Serviço de Cálculo de Pontuação, Multiplicadores de Velocidade, Progressão de Níveis e Classificação.
 * Centraliza as fórmulas competitivas aplicadas em partidas individuais, salas multiplayer e torneios.
 */
export const scoringService = {
  /**
   * Calcula os pontos e XP concedidos por uma resposta correcta, aplicando bónus de tempo e combo de streak.
   * 
   * @param {Object} params
   * @param {number} params.basePoints - Pontos base configurados na pergunta (ex: 100)
   * @param {number} params.baseXp - XP base configurado na pergunta (ex: 25)
   * @param {'INICIANTE' | 'MEDIO' | 'PROFISSIONAL' | 'HOKAGE'} params.difficulty
   * @param {number} params.timeLimitSeconds - Limite máximo de tempo da questão
   * @param {number} params.responseTimeMs - Tempo medido até a resposta
   * @param {number} [params.currentStreak=0] - Sequência consecutiva de respostas certas
   * @returns {{ pointsAwarded: number, xpAwarded: number, speedBonus: number, streakMultiplier: number }}
   */
  calculateQuestionScore: ({
    basePoints = 100,
    baseXp = 25,
    difficulty = 'INICIANTE',
    timeLimitSeconds = 15,
    responseTimeMs = 0,
    currentStreak = 0,
  }) => {
    const diffConfig = DIFFICULTY_WEIGHTS[difficulty] || DIFFICULTY_WEIGHTS.INICIANTE;
    const timeLimitMs = timeLimitSeconds * 1000;

    // 1. Multiplicador de Velocidade:
    // Responder nos primeiros 20% do tempo concede bónus máximo de 40%.
    // O bónus decresce linearmente até 0% no esgotamento do tempo.
    const timeRatio = Math.max(0, Math.min(1, responseTimeMs / timeLimitMs));
    const speedBonusRate = Math.max(0, 0.40 * (1 - timeRatio));
    const speedMultiplier = 1 + speedBonusRate;

    // 2. Multiplicador de Combo / Streak de acertos:
    // 3 acertos seguidos: +10% | 5 acertos: +25% | 8+ acertos: +50%
    let streakMultiplier = 1.0;
    if (currentStreak >= 8) {
      streakMultiplier = 1.50;
    } else if (currentStreak >= 5) {
      streakMultiplier = 1.25;
    } else if (currentStreak >= 3) {
      streakMultiplier = 1.10;
    }

    // 3. Aplicação composta das fórmulas
    const rawPoints = basePoints * diffConfig.pointsMultiplier * speedMultiplier * streakMultiplier;
    const rawXp = baseXp * diffConfig.xpMultiplier * (1 + (speedBonusRate * 0.5));

    const pointsAwarded = Math.round(rawPoints);
    const xpAwarded = Math.round(rawXp);

    return {
      pointsAwarded,
      xpAwarded,
      speedBonus: Math.round(speedBonusRate * 100), // Exibe percentual de bónus (ex: 35%)
      streakMultiplier,
    };
  },

  /**
   * Calcula o nível e o progresso percentual até o próximo patamar com base no XP acumulado.
   * Fórmula: Nível = floor(sqrt(XP / 100)) + 1
   * XP para Nível N = (N - 1)^2 * 100
   * 
   * @param {number} totalXp
   * @returns {{
   *   currentLevel: number,
   *   currentXp: number,
   *   xpCurrentLevelBase: number,
   *   xpNextLevelTarget: number,
   *   xpIntoCurrentLevel: number,
   *   xpRequiredForNextLevel: number,
   *   progressPercentage: number,
   *   rankTier: string,
   *   rankTitle: string
   * }}
   */
  calculateLevelProgress: (totalXp) => {
    const xp = Math.max(0, parseInt(totalXp, 10) || 0);
    const currentLevel = Math.floor(Math.sqrt(xp / 100)) + 1;

    const xpCurrentLevelBase = Math.pow(currentLevel - 1, 2) * 100;
    const xpNextLevelTarget = Math.pow(currentLevel, 2) * 100;

    const xpRequiredForNextLevel = xpNextLevelTarget - xpCurrentLevelBase;
    const xpIntoCurrentLevel = xp - xpCurrentLevelBase;

    const progressPercentage = xpRequiredForNextLevel > 0
      ? Math.min(100, Math.round((xpIntoCurrentLevel / xpRequiredForNextLevel) * 10000) / 100)
      : 100.00;

    // Determina o escalão competitivo correspondente
    const tierConfig = RANK_TIERS.find((t) => currentLevel >= t.minLevel) || RANK_TIERS[RANK_TIERS.length - 1];

    return {
      currentLevel,
      currentXp: xp,
      xpCurrentLevelBase,
      xpNextLevelTarget,
      xpIntoCurrentLevel,
      xpRequiredForNextLevel,
      progressPercentage,
      rankTier: tierConfig.tier,
      rankTitle: tierConfig.title,
    };
  },

  /**
   * Avalia o desempenho global de uma partida concedendo classificação de honra (Rank Grade: S, A, B, C, D).
   * 
   * @param {number} accuracyPercentage - Precisão de 0 a 100
   * @param {number} totalTimeSeconds - Tempo total despendido
   * @param {number} totalQuestions - Quantidade de questões
   * @returns {{ grade: 'S' | 'A' | 'B' | 'C' | 'D', title: string, color: string }}
   */
  evaluateMatchRating: (accuracyPercentage, totalTimeSeconds, totalQuestions) => {
    const accuracy = Math.max(0, Math.min(100, accuracyPercentage));
    const avgTimePerQuestion = totalQuestions > 0 ? totalTimeSeconds / totalQuestions : 15;

    if (accuracy >= 95 && avgTimePerQuestion <= 7) {
      return { grade: 'S', title: 'Perfeição Absoluta (Rank S)', color: '#ffd700' };
    }
    if (accuracy >= 85) {
      return { grade: 'A', title: 'Excelente Desempenho (Rank A)', color: '#00f2fe' };
    }
    if (accuracy >= 70) {
      return { grade: 'B', title: 'Bom Conhecimento (Rank B)', color: '#00ff66' };
    }
    if (accuracy >= 50) {
      return { grade: 'C', title: 'Suficiente (Rank C)', color: '#ff8c00' };
    }
    return { grade: 'D', title: 'Necessita Treino (Rank D)', color: '#ff0055' };
  },
};

export default scoringService;