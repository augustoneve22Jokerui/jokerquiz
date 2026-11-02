/**
 * Seed inicial: Banco de Questões Oficiais e Alternativas do Ecossistema Anime Quiz.
 * Cobre as quatro dificuldades (INICIANTE, MEDIO, PROFISSIONAL, HOKAGE)
 * e associa perguntas às categorias e universos de anime semeados anteriormente.
 * 
 * @param {import('pg').PoolClient} client - Cliente transacional PostgreSQL Neon
 */
export const runSeed = async (client) => {
  console.log('[SEED:003] A semear banco de perguntas e alternativas oficiais...');

  // 1. Mapeamento de categorias e animes para vinculação relacional
  const { rows: categories } = await client.query('SELECT id, slug FROM quiz_categories;');
  const catMap = new Map(categories.map((c) => [c.slug, c.id]));

  const { rows: animes } = await client.query('SELECT id, slug FROM animes;');
  const animeMap = new Map(animes.map((a) => [a.slug, a.id]));

  // 2. Acervo de Questões com 4 Alternativas Reais por Enunciado
  const questionsCatalog = [
    // -------------------------------------------------------------------------
    // DIFICULDADE: INICIANTE
    // -------------------------------------------------------------------------
    {
      categorySlug: 'poderes-e-habilidades',
      animeSlug: 'naruto-shippuuden',
      difficulty: 'INICIANTE',
      timeLimit: 15,
      points: 100,
      xp: 25,
      text: 'Qual é o nome do jutsu de clonagem característico mais utilizado por Naruto Uzumaki?',
      explanation: 'O Kage Bunshin no Jutsu (Clones das Sombras) é uma técnica de rank B criada pelo Segundo Hokage que divide o chakra do utilizador uniformemente.',
      answers: [
        { text: 'Kage Bunshin no Jutsu', isCorrect: true, order: 1 },
        { text: 'Chidori', isCorrect: false, order: 2 },
        { text: 'Amaterasu', isCorrect: false, order: 3 },
        { text: 'Kamui', isCorrect: false, order: 4 },
      ],
    },
    {
      categorySlug: 'protagonistas-e-mestres',
      animeSlug: 'one-piece',
      difficulty: 'INICIANTE',
      timeLimit: 15,
      points: 100,
      xp: 25,
      text: 'Quem deu o icónico Chapéu de Palha a Monkey D. Luffy na sua infância no East Blue?',
      explanation: 'Shanks, o Ruivo, confiou o seu chapéu de palha a Luffy na Vila Foosha, pedindo que ele o devolvesse quando se tornasse um grande pirata.',
      answers: [
        { text: 'Gol D. Roger', isCorrect: false, order: 1 },
        { text: 'Silvers Rayleigh', isCorrect: false, order: 2 },
        { text: 'Shanks, o Ruivo', isCorrect: true, order: 3 },
        { text: 'Monkey D. Garp', isCorrect: false, order: 4 },
      ],
    },
    {
      categorySlug: 'shonen-e-batalhas',
      animeSlug: 'attack-on-titan',
      difficulty: 'INICIANTE',
      timeLimit: 15,
      points: 100,
      xp: 25,
      text: 'Qual é o nome da muralha exterior que foi destruída pelo Titã Colossal no início da história?',
      explanation: 'A Muralha Maria era a mais externa das três muralhas que protegiam a humanidade em Paradis e caiu no ano 845.',
      answers: [
        { text: 'Muralha Rose', isCorrect: false, order: 1 },
        { text: 'Muralha Maria', isCorrect: true, order: 2 },
        { text: 'Muralha Sina', isCorrect: false, order: 3 },
        { text: 'Muralha Shiganshina', isCorrect: false, order: 4 },
      ],
    },

    // -------------------------------------------------------------------------
    // DIFICULDADE: MEDIO
    // -------------------------------------------------------------------------
    {
      categorySlug: 'poderes-e-habilidades',
      animeSlug: 'jujutsu-kaisen',
      difficulty: 'MEDIO',
      timeLimit: 15,
      points: 200,
      xp: 50,
      text: 'Qual é o nome da Expansão de Domínio (Ryōiki Tenkai) de Satoru Gojo?',
      explanation: 'Muryōkūsho (Vazio Imensurável) sobrecarrega a mente do adversário com informação infinita, paralisando os seus sentidos.',
      answers: [
        { text: 'Fukuma Mizushi (Santuário Malevolente)', isCorrect: false, order: 1 },
        { text: 'Muryōkūsho (Vazio Imensurável)', isCorrect: true, order: 2 },
        { text: 'Kango An\'eiteki (Jardim das Sombras)', isCorrect: false, order: 3 },
        { text: 'Jiei Endonka (Encarnação da Auto-Perfeição)', isCorrect: false, order: 4 },
      ],
    },
    {
      categorySlug: 'viloes-e-antagonistas',
      animeSlug: 'naruto-shippuuden',
      difficulty: 'MEDIO',
      timeLimit: 15,
      points: 200,
      xp: 50,
      text: 'Quem foi o verdadeiro fundador e primeiro líder ideológico da organização Akatsuki original antes de ser corrompida?',
      explanation: 'Yahiko fundou a Akatsuki original na Vila da Chuva ao lado de Nagato e Konan, com o objectivo de alcançar a paz através do diálogo.',
      answers: [
        { text: 'Nagato Uzumaki', isCorrect: false, order: 1 },
        { text: 'Yahiko', isCorrect: true, order: 2 },
        { text: 'Obito Uchiha', isCorrect: false, order: 3 },
        { text: 'Madara Uchiha', isCorrect: false, order: 4 },
      ],
    },
    {
      categorySlug: 'seinen-e-estrategia',
      animeSlug: 'death-note',
      difficulty: 'MEDIO',
      timeLimit: 15,
      points: 200,
      xp: 50,
      text: 'Qual é o verdadeiro nome do detective L, revelado no livro oficial de guia How to Read?',
      explanation: 'O verdadeiro nome completo do detective genial L é L Lawliet.',
      answers: [
        { text: 'L Lawliet', isCorrect: true, order: 1 },
        { text: 'L Lind Taylor', isCorrect: false, order: 2 },
        { text: 'Nate River', isCorrect: false, order: 3 },
        { text: 'Mihael Keehl', isCorrect: false, order: 4 },
      ],
    },

    // -------------------------------------------------------------------------
    // DIFICULDADE: PROFISSIONAL
    // -------------------------------------------------------------------------
    {
      categorySlug: 'poderes-e-habilidades',
      animeSlug: 'hunter-x-hunter-2011',
      difficulty: 'PROFISSIONAL',
      timeLimit: 12,
      points: 350,
      xp: 90,
      text: 'Qual das seguintes técnicas de Nen NÃO pertence à categoria de Nen dos Seis Tipos Básicos?',
      explanation: 'En é uma aplicação avançada derivada de Ren e Ten, não um dos 6 princípios fundamentais (Reforço, Emissão, Manipulação, Materialização, Transformação, Especialização).',
      answers: [
        { text: 'Especialização (Tokushitsu)', isCorrect: false, order: 1 },
        { text: 'En', isCorrect: true, order: 2 },
        { text: 'Materialização (Gugenka)', isCorrect: false, order: 3 },
        { text: 'Transformação (Henka)', isCorrect: false, order: 4 },
      ],
    },
    {
      categorySlug: 'arcos-e-guerras-epicas',
      animeSlug: 'fullmetal-alchemist-brotherhood',
      difficulty: 'PROFISSIONAL',
      timeLimit: 12,
      points: 350,
      xp: 90,
      text: 'Qual é o verdadeiro nome do primeiro Homúnculo, criado a partir do sangue de Van Hohenheim em Xerxes?',
      explanation: 'O Pai (Father) era originalmente conhecido apenas como o "Homúnculo no Frasco" (Dwarf in the Flask).',
      answers: [
        { text: 'O Homúnculo no Frasco (Dwarf in the Flask)', isCorrect: true, order: 1 },
        { text: 'Pride (Orgulho)', isCorrect: false, order: 2 },
        { text: 'Wrath (Ira)', isCorrect: false, order: 3 },
        { text: 'Envy (Inveja)', isCorrect: false, order: 4 },
      ],
    },
    {
      categorySlug: 'shonen-e-batalhas',
      animeSlug: 'dragon-ball-z',
      difficulty: 'PROFISSIONAL',
      timeLimit: 12,
      points: 350,
      xp: 90,
      text: 'Durante a Saga de Cell, quanto tempo no mundo exterior equivalia a um ano inteiro de treino dentro da Sala do Tempo e da Mente?',
      explanation: 'Um ano dentro da Sala do Tempo e da Mente (Hyperbolic Time Chamber) equivale a exactamente 1 dia (24 horas) na Terra.',
      answers: [
        { text: '12 Horas', isCorrect: false, order: 1 },
        { text: '24 Horas (1 Dia)', isCorrect: true, order: 2 },
        { text: '48 Horas (2 Dias)', isCorrect: false, order: 3 },
        { text: '1 Semana', isCorrect: false, order: 4 },
      ],
    },

    // -------------------------------------------------------------------------
    // DIFICULDADE: HOKAGE (NÍVEL SUPREMO COMPETITIVO)
    // -------------------------------------------------------------------------
    {
      categorySlug: 'arcos-e-guerras-epicas',
      animeSlug: 'one-piece',
      difficulty: 'HOKAGE',
      timeLimit: 10,
      points: 500,
      xp: 150,
      text: 'Qual é o nome da Akuma no Mi original de Monkey D. Luffy, conforme revelado pelo Governo Mundial no Arco de Wano?',
      explanation: 'A fruta antes rotulada como Gomu Gomu no Mi é na verdade uma Zoan Mítica: Hito Hito no Mi, Modelo: Nika (Deus do Sol).',
      answers: [
        { text: 'Hito Hito no Mi: Modelo Daibutsu', isCorrect: false, order: 1 },
        { text: 'Hito Hito no Mi: Modelo Nika', isCorrect: true, order: 2 },
        { text: 'Gomu Gomu no Mi: Despertada', isCorrect: false, order: 3 },
        { text: 'Taiyo Taiyo no Mi: Modelo Solaris', isCorrect: false, order: 4 },
      ],
    },
    {
      categorySlug: 'poderes-e-habilidades',
      animeSlug: 'naruto-shippuuden',
      difficulty: 'HOKAGE',
      timeLimit: 10,
      points: 500,
      xp: 150,
      text: 'Qual é a combinação exacta de Naturezas Básicas de Chakra necessária para criar a Kekkei Tōta do Elemento Poeira (Jinton)?',
      explanation: 'O Jinton (Elemento Poeira) do Segundo e Terceiro Tsuchikage combina Terra, Fogo e Vento simultaneamente.',
      answers: [
        { text: 'Fogo, Terra e Vento', isCorrect: true, order: 1 },
        { text: 'Fogo, Raio e Terra', isCorrect: false, order: 2 },
        { text: 'Água, Vento e Terra', isCorrect: false, order: 3 },
        { text: 'Vento, Raio e Fogo', isCorrect: false, order: 4 },
      ],
    },
    {
      categorySlug: 'arcos-e-guerras-epicas',
      animeSlug: 'attack-on-titan',
      difficulty: 'HOKAGE',
      timeLimit: 10,
      points: 500,
      xp: 150,
      text: 'Qual é o nome da mãe de Levi Ackerman, que faleceu no submundo da Muralha antes deste ser resgatado por Kenny?',
      explanation: 'Kuchel Ackerman era irmã de Kenny Ackerman e mãe de Levi, trabalhando no distrito subterrâneo sob o pseudónimo de Olympia.',
      answers: [
        { text: 'Kuchel Ackerman', isCorrect: true, order: 1 },
        { text: 'Carla Ackerman', isCorrect: false, order: 2 },
        { text: 'Alma Ackerman', isCorrect: false, order: 3 },
        { text: 'Dina Ackerman', isCorrect: false, order: 4 },
      ],
    },
  ];

  // 3. Inserção Transacional Idempotente das Perguntas e Alternativas
  for (const q of questionsCatalog) {
    const categoryId = catMap.get(q.categorySlug);
    const animeId = animeMap.get(q.animeSlug);

    if (!categoryId) {
      console.warn(`[SEED:003 WARN] Categoria [${q.categorySlug}] não encontrada. Questão ignorada.`);
      continue;
    }

    // Verifica se a pergunta já existe pelo enunciado exato para evitar duplicações
    const { rows: existingQuestions } = await client.query(
      'SELECT id FROM quiz_questions WHERE question_text = $1;',
      [q.text]
    );

    let questionId;

    if (existingQuestions.length > 0) {
      questionId = existingQuestions[0].id;
      // Atualiza metadados da pergunta existente
      await client.query(
        `UPDATE quiz_questions SET
           category_id = $1,
           anime_id = $2,
           difficulty = $3,
           explanation = $4,
           time_limit_seconds = $5,
           base_points = $6,
           base_xp = $7,
           is_published = TRUE
         WHERE id = $8;`,
        [categoryId, animeId, q.difficulty, q.explanation, q.timeLimit, q.points, q.xp, questionId]
      );
    } else {
      const { rows: insertedQuestion } = await client.query(
        `INSERT INTO quiz_questions (
           category_id,
           anime_id,
           question_text,
           difficulty,
           explanation,
           time_limit_seconds,
           base_points,
           base_xp,
           is_published
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
         RETURNING id;`,
        [categoryId, animeId, q.text, q.difficulty, q.explanation, q.timeLimit, q.points, q.xp]
      );
      questionId = insertedQuestion[0].id;
    }

    // Substitui as alternativas da questão de forma limpa e determinística
    await client.query('DELETE FROM quiz_answers WHERE question_id = $1;', [questionId]);

    for (const ans of q.answers) {
      await client.query(
        `INSERT INTO quiz_answers (question_id, answer_text, is_correct, display_order)
         VALUES ($1, $2, $3, $4);`,
        [questionId, ans.text, ans.isCorrect, ans.order]
      );
    }
  }

  console.log('[SEED:003] Concluído com sucesso.');
};

export default runSeed;