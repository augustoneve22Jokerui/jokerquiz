import { withTransaction } from '../database/connection.js';
import { tournamentRepository } from '../repositories/tournament.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { achievementRepository } from '../repositories/achievement.repository.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { scoringService } from './scoring.service.js';
import { calculatePodiumDistribution, roundCurrency } from '../utils/currency.util.js';
import { generatePaymentReference } from '../utils/token.util.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.util.js';

/**
 * Converte um título em slug único para URLs amigáveis.
 * 
 * @param {string} title
 * @returns {string}
 */
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
};

/**
 * Retorna o nome oficial descritivo de cada fase eliminatória com base no número de duelos restantes.
 * 
 * @param {number} matchesCount
 * @returns {string}
 */
const getRoundName = (matchesCount) => {
  switch (matchesCount) {
    case 1:
      return 'Grande Final';
    case 2:
      return 'Meias-Finais';
    case 4:
      return 'Quartos de Final';
    case 8:
      return 'Oitavas de Final';
    case 16:
      return 'Dezasseis-avos de Final';
    default:
      return `Ronda Eliminatória (${matchesCount * 2} Jogadores)`;
  }
};

/**
 * Serviço de Negócio para Gestão Integral de Torneios, Chaves Eliminatórias (Brackets) e Inscrições.
 */
export const tournamentService = {
  /**
   * Cria um novo torneio oficial na plataforma.
   * 
   * @param {Object} data
   * @param {string} data.title
   * @param {string} data.description
   * @param {string} data.rules
   * @param {string} [data.bannerUrl]
   * @param {'INICIANTE' | 'MEDIO' | 'PROFISSIONAL' | 'HOKAGE'} data.difficulty
   * @param {number|null} [data.categoryId=null]
   * @param {number} [data.maxParticipants=16]
   * @param {boolean} [data.isPaid=false]
   * @param {number} [data.entryFee=0]
   * @param {number} [data.prizePool=0]
   * @param {string} [data.currency='AOA']
   * @param {Date} data.registrationStartAt
   * @param {Date} data.registrationEndAt
   * @param {Date} data.tournamentStartAt
   * @param {string} data.createdBy - UUID
   * @returns {Promise<Object>}
   */
  createTournament: async (data) => {
    let baseSlug = generateSlug(data.title);
    let slug = baseSlug;
    let counter = 1;

    // Garante unicidade do slug
    while (await tournamentRepository.findBySlug(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const tournament = await tournamentRepository.create({
      ...data,
      slug,
      entryFee: roundCurrency(data.entryFee || 0),
      prizePool: roundCurrency(data.prizePool || 0),
    });

    // Cria o canal de conversação do torneio
    await chatRepository.getOrCreateTournamentConversation(tournament.id, tournament.title);

    logger.info(`Torneio criado: ${tournament.title} (${tournament.id}) | Slug=${slug}`);
    return tournament;
  },

  /**
   * Solicita a inscrição de um jogador num torneio:
   * - Torneios Gratuitos: aprovação imediata respeitando vagas.
   * - Torneios Pagos (AOA): gera cobrança e coloca inscrição em 'PENDING_PAYMENT'.
   * 
   * @param {Object} data
   * @param {string} data.tournamentId - UUID
   * @param {string} data.userId - UUID
   * @param {'BANK_TRANSFER' | 'MULTICAIXA_EXPRESS'} [data.paymentMethod='BANK_TRANSFER']
   * @returns {Promise<Object>} Registo da inscrição e dados de pagamento se aplicável
   */
  registerUser: async ({ tournamentId, userId, paymentMethod = 'BANK_TRANSFER' }) => {
    return await withTransaction(async (client) => {
      // 1. Bloqueia a linha do torneio com exclusividade para evitar superlotação concorrente
      const tournament = await tournamentRepository.findByIdWithLock(tournamentId, client);
      if (!tournament) {
        throw new AppError('Torneio não encontrado.', 404, 'TOURNAMENT_NOT_FOUND');
      }

      if (tournament.status !== 'REGISTRATION_OPEN') {
        throw new AppError(
          'As inscrições para este torneio não se encontram abertas no momento.',
          400,
          'REGISTRATIONS_CLOSED'
        );
      }

      // 2. Verifica se o jogador já se inscreveu
      const existingRegistration = await tournamentRepository.findRegistration(
        tournamentId,
        userId,
        client
      );
      if (existingRegistration) {
        throw new AppError(
          'Já submeteu uma inscrição para este torneio.',
          400,
          'ALREADY_REGISTERED'
        );
      }

      // 3. Valida capacidade restante de vagas aprovadas
      const { rows: approvedRows } = await client.query(
        `SELECT COUNT(*) AS total FROM tournament_registrations 
         WHERE tournament_id = $1 AND status = 'APPROVED';`,
        [tournamentId]
      );
      const approvedCount = parseInt(approvedRows[0].total, 10);

      if (approvedCount >= tournament.max_participants) {
        throw new AppError(
          'A capacidade máxima de competidores deste torneio foi atingida.',
          400,
          'TOURNAMENT_FULL'
        );
      }

      // 4. Fluxo para Torneio Gratuito
      if (!tournament.is_paid || tournament.entry_fee <= 0) {
        const registration = await tournamentRepository.createRegistration(
          tournamentId,
          userId,
          'APPROVED',
          client
        );

        await notificationRepository.create(
          {
            userId,
            title: 'Inscrição Confirmada!',
            message: `A sua vaga no torneio "${tournament.title}" está confirmada com sucesso. Prepare-se!`,
            type: 'TOURNAMENT',
            link: `/tournaments/${tournamentId}`,
          },
          client
        );

        logger.info(`Inscrição gratuita aprovada: Utilizador=${userId} | Torneio=${tournamentId}`);

        return {
          registration,
          isPaid: false,
          payment: null,
        };
      }

      // 5. Fluxo para Torneio Pago (AOA): cria inscrição pendente e cobrança
      const registration = await tournamentRepository.createRegistration(
        tournamentId,
        userId,
        'PENDING_PAYMENT',
        client
      );

      const referenceCode = generatePaymentReference('TOR');
      const payment = await paymentRepository.create(
        {
          referenceCode,
          userId,
          tournamentId,
          registrationId: registration.id,
          amount: tournament.entry_fee,
          currency: 'AOA',
          paymentMethod,
        },
        client
      );

      await notificationRepository.create(
        {
          userId,
          title: 'Aguardando Pagamento da Inscrição',
          message: `Inscrição registada. Efetue a transferência de ${tournament.entry_fee} AOA com a referência ${referenceCode} e envie o comprovativo.`,
          type: 'PAYMENT',
          link: `/tournaments/${tournamentId}/payment`,
        },
        client
      );

      logger.info(`Inscrição paga criada (Aguardando Pagamento): Utilizador=${userId} | Torneio=${tournamentId} | Ref=${referenceCode}`);

      return {
        registration,
        isPaid: true,
        payment,
      };
    });
  },

  /**
   * Gera a árvore de eliminatórias (Brackets) e emparelha os jogadores aprovados na primeira fase.
   * 
   * @param {string} tournamentId - UUID
   * @returns {Promise<Array<Object>>} Chaves eliminatórias geradas
   */
  generateBrackets: async (tournamentId) => {
    return await withTransaction(async (client) => {
      const tournament = await tournamentRepository.findById(tournamentId, client);
      if (!tournament) {
        throw new AppError('Torneio não encontrado.', 404, 'TOURNAMENT_NOT_FOUND');
      }

      // Consulta todos os competidores confirmados
      const { rows: approvedParticipants } = await client.query(
        `SELECT tr.user_id 
         FROM tournament_registrations tr
         WHERE tr.tournament_id = $1 AND tr.status = 'APPROVED'
         ORDER BY tr.registered_at ASC;`,
        [tournamentId]
      );

      const totalPlayers = approvedParticipants.length;
      if (totalPlayers < 2) {
        throw new AppError(
          'São necessários pelo menos 2 competidores com inscrição aprovada para gerar a chave eliminatória.',
          400,
          'INSUFFICIENT_PLAYERS_FOR_BRACKET'
        );
      }

      // Embaralha aleatoriamente para chaveamento justo
      const shuffledPlayers = approvedParticipants
        .map((p) => p.user_id)
        .sort(() => Math.random() - 0.5);

      // Calcula a quantidade total de fases (ex: 8 jogadores -> 3 fases: Quartos, Meias, Final)
      let currentMatchesCount = Math.floor(tournament.max_participants / 2);
      let roundNumber = 1;

      const createdRounds = [];

      // 1. Cria a primeira fase e popula com os competidores
      const firstRoundName = getRoundName(currentMatchesCount);
      const firstRound = await tournamentRepository.createRound(
        tournamentId,
        roundNumber,
        firstRoundName,
        client
      );

      for (let i = 0; i < currentMatchesCount; i++) {
        const player1 = shuffledPlayers[i * 2] || null;
        const player2 = shuffledPlayers[(i * 2) + 1] || null;

        await tournamentRepository.createMatch(
          {
            tournamentId,
            roundId: firstRound.id,
            matchNumber: i + 1,
            player1UserId: player1,
            player2UserId: player2,
          },
          client
        );
      }

      createdRounds.push(firstRound);

      // 2. Prepara as fases eliminatórias subsequentes (vazias, aguardando vencedores)
      while (currentMatchesCount > 1) {
        currentMatchesCount = Math.floor(currentMatchesCount / 2);
        roundNumber++;

        const nextRoundName = getRoundName(currentMatchesCount);
        const nextRound = await tournamentRepository.createRound(
          tournamentId,
          roundNumber,
          nextRoundName,
          client
        );

        for (let i = 0; i < currentMatchesCount; i++) {
          await tournamentRepository.createMatch(
            {
              tournamentId,
              roundId: nextRound.id,
              matchNumber: i + 1,
              player1UserId: null,
              player2UserId: null,
            },
            client
          );
        }

        createdRounds.push(nextRound);
      }

      // Actualiza o torneio para 'IN_PROGRESS'
      await tournamentRepository.updateStatus(tournamentId, 'IN_PROGRESS', client);

      logger.info(`Chaves eliminatórias geradas com sucesso para o torneio: ${tournament.title} (${createdRounds.length} rondas)`);

      return await tournamentRepository.findRoundsWithMatches(tournamentId, client);
    });
  },

  /**
   * Conclui um confronto eliminatório, regista os pontos e avança o vencedor para a próxima fase.
   * Se for a Grande Final, coroa o campeão e atribui medalhas e prémios.
   * 
   * @param {Object} data
   * @param {string} data.matchId - UUID
   * @param {number} data.player1Score
   * @param {number} data.player2Score
   * @param {string} data.winnerUserId - UUID
   * @returns {Promise<Object>} Partida actualizada
   */
  resolveMatchResult: async ({ matchId, player1Score, player2Score, winnerUserId }) => {
    return await withTransaction(async (client) => {
      // 1. Actualiza o resultado do duelo
      const updatedMatch = await tournamentRepository.updateMatchResult(
        matchId,
        player1Score,
        player2Score,
        winnerUserId,
        client
      );

      if (!updatedMatch) {
        throw new AppError('Partida eliminatória não encontrada.', 404, 'MATCH_NOT_FOUND');
      }

      const { tournament_id: tournamentId, round_id: roundId, match_number: matchNumber } = updatedMatch;

      // 2. Localiza a ronda actual
      const { rows: roundRows } = await client.query(
        `SELECT * FROM tournament_rounds WHERE id = $1;`,
        [roundId]
      );
      const currentRound = roundRows[0];

      // 3. Localiza se existe uma ronda subsequente
      const { rows: nextRoundRows } = await client.query(
        `SELECT * FROM tournament_rounds 
         WHERE tournament_id = $1 AND round_number = $2;`,
        [tournamentId, currentRound.round_number + 1]
      );
      const nextRound = nextRoundRows[0];

      // Se houver próxima ronda, avança o vencedor para a partida correspondente
      if (nextRound) {
        const nextMatchNumber = Math.ceil(matchNumber / 2);
        const isPlayer1Slot = matchNumber % 2 !== 0;

        const updateSlotSql = isPlayer1Slot
          ? `UPDATE tournament_matches SET player1_user_id = $3 WHERE round_id = $1 AND match_number = $2;`
          : `UPDATE tournament_matches SET player2_user_id = $3 WHERE round_id = $1 AND match_number = $2;`;

        await client.query(updateSlotSql, [nextRound.id, nextMatchNumber, winnerUserId]);
        logger.info(`Vencedor ${winnerUserId} avançou para a ronda ${nextRound.round_number} (Partida ${nextMatchNumber})`);
      } else {
        // Se NÃO houver próxima ronda, esta era a GRANDE FINAL: encerra torneio e premia o campeão!
        await tournamentRepository.setChampion(tournamentId, winnerUserId, client);

        const tournament = await tournamentRepository.findById(tournamentId, client);

        // Atribui medalha de ouro ao Campeão
        const goldMedal = await achievementRepository.findByMedalCode('GOLD_CROWN', client);
        if (goldMedal) {
          await achievementRepository.awardMedal(winnerUserId, goldMedal.id, tournamentId, client);
        }

        // Se houver premiação financeira (Prize Pool) em AOA, credita registo contábil
        if (tournament.prize_pool > 0) {
          const distribution = calculatePodiumDistribution(tournament.prize_pool);
          await paymentRepository.createTransaction(
            {
              userId: winnerUserId,
              type: 'PRIZE_PAYOUT',
              amount: distribution.firstPlace,
              currency: tournament.currency,
              description: `1º Lugar - Premiação de Campeão no Torneio: ${tournament.title}`,
            },
            client
          );
        }

        await notificationRepository.create(
          {
            userId: winnerUserId,
            title: 'PARABÉNS, CAMPEÃO!',
            message: `Venceu a Grande Final do torneio "${tournament.title}". O seu nome foi imortalizado no ecossistema!`,
            type: 'ACHIEVEMENT',
            link: `/tournaments/${tournamentId}`,
          },
          client
        );

        logger.info(`CAMPEÃO DO TORNEIO: ${winnerUserId} coroado no torneio ${tournamentId}`);
      }

      return updatedMatch;
    });
  },
};

export default tournamentService;