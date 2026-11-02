/**
 * Seed inicial: Sistema de Gamificação, Conquistas Desbloqueáveis (Achievements) e Medalhas Oficiais.
 * 
 * @param {import('pg').PoolClient} client - Cliente transacional PostgreSQL Neon
 */
export const runSeed = async (client) => {
  console.log('[SEED:004] A semear conquistas desbloqueáveis e medalhas oficiais...');

  // 1. Catálogo Oficial de Conquistas (Achievements)
  const achievements = [
    {
      code: 'FIRST_BLOOD',
      name: 'Primeiro Passo Ninja',
      description: 'Vença a sua primeira partida oficial no ecossistema Anime Quiz.',
      badge_tier: 'BRONZE',
      xp_reward: 100,
      criteria_type: 'WINS_COUNT',
      criteria_threshold: 1,
      icon_url: '/assets/icons/achievements/first-win.svg',
    },
    {
      code: 'GENIN_STRIKE',
      name: 'Ascensão a Genin',
      description: 'Conquiste 10 vitórias em partidas ranqueadas ou salas multiplayer.',
      badge_tier: 'BRONZE',
      xp_reward: 250,
      criteria_type: 'WINS_COUNT',
      criteria_threshold: 10,
      icon_url: '/assets/icons/achievements/genin.svg',
    },
    {
      code: 'CHUNIN_VETERAN',
      name: 'Graduado a Chunin',
      description: 'Alcance a marca de 50 vitórias em partidas competitivas.',
      badge_tier: 'SILVER',
      xp_reward: 750,
      criteria_type: 'WINS_COUNT',
      criteria_threshold: 50,
      icon_url: '/assets/icons/achievements/chunin.svg',
    },
    {
      code: 'JONIN_ELITE',
      name: 'Força de Elite Jonin',
      description: 'Conquiste 150 vitórias demonstrando conhecimento enciclopédico sobre anime.',
      badge_tier: 'GOLD',
      xp_reward: 2000,
      criteria_type: 'WINS_COUNT',
      criteria_threshold: 150,
      icon_url: '/assets/icons/achievements/jonin.svg',
    },
    {
      code: 'PERFECT_RUN',
      name: 'Conhecimento Absoluto',
      description: 'Complete uma sessão ranqueada acertando 100% de todas as perguntas.',
      badge_tier: 'GOLD',
      xp_reward: 1500,
      criteria_type: 'PERFECT_SCORE',
      criteria_threshold: 1,
      icon_url: '/assets/icons/achievements/perfect.svg',
    },
    {
      code: 'HOKAGE_LEGEND',
      name: 'Lenda do Mundo Shinobi',
      description: 'Vença 5 partidas consecutivas no nível de dificuldade supremo: HOKAGE.',
      badge_tier: 'DIAMOND',
      xp_reward: 5000,
      criteria_type: 'HOKAGE_STREAK',
      criteria_threshold: 5,
      icon_url: '/assets/icons/achievements/hokage.svg',
    },
    {
      code: 'TOURNAMENT_CHAMPION',
      name: 'Campeão da Grande Arena',
      description: 'Conquiste o 1º lugar na chave final de um torneio oficial com eliminatórias.',
      badge_tier: 'DIAMOND',
      xp_reward: 10000,
      criteria_type: 'TOURNAMENT_CHAMPION',
      criteria_threshold: 1,
      icon_url: '/assets/icons/achievements/trophy.svg',
    },
  ];

  for (const ach of achievements) {
    await client.query(
      `INSERT INTO achievements (
         code,
         name,
         description,
         badge_tier,
         xp_reward,
         criteria_type,
         criteria_threshold,
         icon_url
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         badge_tier = EXCLUDED.badge_tier,
         xp_reward = EXCLUDED.xp_reward,
         criteria_type = EXCLUDED.criteria_type,
         criteria_threshold = EXCLUDED.criteria_threshold,
         icon_url = EXCLUDED.icon_url;`,
      [
        ach.code,
        ach.name,
        ach.description,
        ach.badge_tier,
        ach.xp_reward,
        ach.criteria_type,
        ach.criteria_threshold,
        ach.icon_url,
      ]
    );
  }

  // 2. Medalhas Oficiais para Pódios de Torneios e Eventos Sazonais
  const medals = [
    {
      code: 'GOLD_CROWN',
      name: 'Medalha de Ouro do Torneio',
      description: 'Concedida exclusivamente aos vencedores invictos de torneios oficiais em Angola.',
      icon_url: '/assets/icons/medals/medal-gold.svg',
    },
    {
      code: 'SILVER_CROWN',
      name: 'Medalha de Prata do Torneio',
      description: 'Concedida aos finalistas valorosos que alcançaram o 2º lugar na Grande Final.',
      icon_url: '/assets/icons/medals/medal-silver.svg',
    },
    {
      code: 'BRONZE_CROWN',
      name: 'Medalha de Bronze do Torneio',
      description: 'Concedida aos semifinalistas que garantiram o 3º lugar do pódio competitivo.',
      icon_url: '/assets/icons/medals/medal-bronze.svg',
    },
    {
      code: 'TOP_RANKING_SEASON',
      name: 'Insígnia dos Quatro Imperadores',
      description: 'Distinção concedida ao Top 1 do Ranking Global ao término da temporada.',
      icon_url: '/assets/icons/medals/medal-yonko.svg',
    },
  ];

  for (const medal of medals) {
    await client.query(
      `INSERT INTO medals (code, name, description, icon_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         icon_url = EXCLUDED.icon_url;`,
      [medal.code, medal.name, medal.description, medal.icon_url]
    );
  }

  console.log('[SEED:004] Concluído com sucesso.');
};

export default runSeed;