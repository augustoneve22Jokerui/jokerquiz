/**
 * Seed inicial: Categorias Temáticas, Biblioteca Base de Animes (MAL/Jikan) e Personagens.
 * 
 * @param {import('pg').PoolClient} client - Cliente transacional PostgreSQL Neon
 */
export const runSeed = async (client) => {
  console.log('[SEED:002] A semear categorias temáticas e biblioteca de animes...');

  // 1. Categorias Temáticas Oficiais do Ecossistema
  const categories = [
    {
      name: 'Shonen & Batalhas',
      slug: 'shonen-e-batalhas',
      description: 'Lutas clássicas, escalada de poder e combates corpo a corpo lendários.',
      icon_name: 'swords',
      color_hex: '#ff0055',
    },
    {
      name: 'Poderes & Habilidades',
      slug: 'poderes-e-habilidades',
      description: 'Jutsus, Akuma no Mi, Nen, Ki, Expansões de Domínio e técnicas supremas.',
      icon_name: 'flame',
      color_hex: '#00f2fe',
    },
    {
      name: 'Arcos & Guerras Épicas',
      slug: 'arcos-e-guerras-epicas',
      description: 'Acontecimentos históricos, estratégias de guerra e desfechos inesquecíveis.',
      icon_name: 'shield-alert',
      color_hex: '#ffd700',
    },
    {
      name: 'Vilões & Antagonistas',
      slug: 'viloes-e-antagonistas',
      description: 'Motivações obscuras, organizações secretas e antagonistas icónicos.',
      icon_name: 'skull',
      color_hex: '#8a2be2',
    },
    {
      name: 'Protagonistas & Mestres',
      slug: 'protagonistas-e-mestres',
      description: 'Histórias de origem, mestres lendários e legados transmitidos entre gerações.',
      icon_name: 'crown',
      color_hex: '#ff8c00',
    },
    {
      name: 'Seinen & Estratégia',
      slug: 'seinen-e-estrategia',
      description: 'Batalhas psicológicas, enigmas complexos e narrativa madura.',
      icon_name: 'brain',
      color_hex: '#00ff66',
    },
  ];

  for (const cat of categories) {
    await client.query(
      `INSERT INTO quiz_categories (name, slug, description, icon_name, color_hex, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         icon_name = EXCLUDED.icon_name,
         color_hex = EXCLUDED.color_hex;`,
      [cat.name, cat.slug, cat.description, cat.icon_name, cat.color_hex]
    );
  }

  // 2. Biblioteca Base de Animes (com IDs correspondentes da MyAnimeList para cache)
  const animes = [
    {
      mal_id: 1735,
      title: 'Naruto: Shippuuden',
      title_english: 'Naruto Shippuden',
      title_japanese: 'NARUTO -ナルト- 疾風伝',
      slug: 'naruto-shippuuden',
      synopsis: 'Naruto Uzumaki regressa à Aldeia da Folha após anos de treino com Jiraiya para enfrentar a Akatsuki e salvar Sasuke Uchiha.',
      image_url: 'https://cdn.myanimelist.net/images/anime/1565/111305l.jpg',
      episodes: 500,
      score: 8.28,
      status: 'Finished Airing',
      genres: ['Action', 'Adventure', 'Fantasy'],
    },
    {
      mal_id: 21,
      title: 'One Piece',
      title_english: 'One Piece',
      title_japanese: 'ONE PIECE',
      slug: 'one-piece',
      synopsis: 'Monkey D. Luffy e a tripulação dos Chapéus de Palha navegam pelos mares da Grand Line em busca do tesouro supremo, o One Piece.',
      image_url: 'https://cdn.myanimelist.net/images/anime/1244/138851l.jpg',
      episodes: 1100,
      score: 8.72,
      status: 'Currently Airing',
      genres: ['Action', 'Adventure', 'Fantasy'],
    },
    {
      mal_id: 16498,
      title: 'Shingeki no Kyojin',
      title_english: 'Attack on Titan',
      title_japanese: '進撃の巨人',
      slug: 'attack-on-titan',
      synopsis: 'A humanidade vive cercada por muralhas gigantescas para se proteger de titãs devoradores, até que uma brecha catastrófica muda tudo.',
      image_url: 'https://cdn.myanimelist.net/images/anime/10/47347l.jpg',
      episodes: 25,
      score: 8.55,
      status: 'Finished Airing',
      genres: ['Action', 'Suspense', 'Drama'],
    },
    {
      mal_id: 813,
      title: 'Dragon Ball Z',
      title_english: 'Dragon Ball Z',
      title_japanese: 'ドラゴンボールZ',
      slug: 'dragon-ball-z',
      synopsis: 'Goku descobre as suas verdadeiras origens como guerreiro Saiyajin e defende a Terra contra ameaças cósmicas devastadoras.',
      image_url: 'https://cdn.myanimelist.net/images/anime/12/19448l.jpg',
      episodes: 291,
      score: 8.18,
      status: 'Finished Airing',
      genres: ['Action', 'Adventure', 'Fantasy'],
    },
    {
      mal_id: 11061,
      title: 'Hunter x Hunter (2011)',
      title_english: 'Hunter x Hunter',
      title_japanese: 'HUNTER×HUNTER（2011）',
      slug: 'hunter-x-hunter-2011',
      synopsis: 'Gon Freecss parte numa jornada épica para se tornar um Hunter oficial e encontrar o seu pai desaparecido, dominando o Nen.',
      image_url: 'https://cdn.myanimelist.net/images/anime/1337/99013l.jpg',
      episodes: 148,
      score: 9.04,
      status: 'Finished Airing',
      genres: ['Action', 'Adventure', 'Fantasy'],
    },
    {
      mal_id: 40748,
      title: 'Jujutsu Kaisen',
      title_english: 'Jujutsu Kaisen',
      title_japanese: '呪術廻戦',
      slug: 'jujutsu-kaisen',
      synopsis: 'Yuji Itadori engole um dedo amaldiçoado de Ryomen Sukuna e é introduzido no mundo perigoso dos Feiticeiros Jujutsu.',
      image_url: 'https://cdn.myanimelist.net/images/anime/1171/109222l.jpg',
      episodes: 24,
      score: 8.61,
      status: 'Finished Airing',
      genres: ['Action', 'Fantasy', 'Supernatural'],
    },
    {
      mal_id: 1535,
      title: 'Death Note',
      title_english: 'Death Note',
      title_japanese: 'DEATH NOTE',
      slug: 'death-note',
      synopsis: 'Light Yagami encontra um caderno sobrenatural com o poder de matar qualquer pessoa e inicia um jogo mortal com o detective L.',
      image_url: 'https://cdn.myanimelist.net/images/anime/9/9453l.jpg',
      episodes: 37,
      score: 8.62,
      status: 'Finished Airing',
      genres: ['Suspense', 'Psychological', 'Supernatural'],
    },
    {
      mal_id: 5114,
      title: 'Fullmetal Alchemist: Brotherhood',
      title_english: 'Fullmetal Alchemist: Brotherhood',
      title_japanese: '鋼の錬金術師 FULLMETAL ALCHEMIST',
      slug: 'fullmetal-alchemist-brotherhood',
      synopsis: 'Os irmãos Edward e Alphonse Elric buscam a lendária Pedra Filosofal para restaurar os seus corpos após uma transmutação proibida.',
      image_url: 'https://cdn.myanimelist.net/images/anime/1223/96541l.jpg',
      episodes: 64,
      score: 9.10,
      status: 'Finished Airing',
      genres: ['Action', 'Adventure', 'Drama', 'Fantasy'],
    },
  ];

  for (const anime of animes) {
    await client.query(
      `INSERT INTO animes (mal_id, title, title_english, title_japanese, slug, synopsis, image_url, episodes, score, status, genres, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
       ON CONFLICT (slug) DO UPDATE SET
         mal_id = EXCLUDED.mal_id,
         title = EXCLUDED.title,
         title_english = EXCLUDED.title_english,
         synopsis = EXCLUDED.synopsis,
         image_url = EXCLUDED.image_url,
         episodes = EXCLUDED.episodes,
         score = EXCLUDED.score;`,
      [
        anime.mal_id,
        anime.title,
        anime.title_english,
        anime.title_japanese,
        anime.slug,
        anime.synopsis,
        anime.image_url,
        anime.episodes,
        anime.score,
        anime.status,
        anime.genres,
      ]
    );
  }

  // 3. Personagens Principais Vinculados
  const { rows: dbAnimes } = await client.query('SELECT id, slug FROM animes;');
  const animeMap = new Map(dbAnimes.map((a) => [a.slug, a.id]));

  const characters = [
    { animeSlug: 'naruto-shippuuden', name: 'Naruto Uzumaki', role: 'Main', about: 'O Jinchuuriki da Raposa de Nove Caudas e futuro Sétimo Hokage.' },
    { animeSlug: 'naruto-shippuuden', name: 'Sasuke Uchiha', role: 'Main', about: 'Último sobrevivente do massacre Uchiha e portador do Rinnegan.' },
    { animeSlug: 'naruto-shippuuden', name: 'Kakashi Hatake', role: 'Supporting', about: 'O Ninja Copiador de Konoha e líder do Time 7.' },
    { animeSlug: 'one-piece', name: 'Monkey D. Luffy', role: 'Main', about: 'Capitão dos Chapéus de Palha e portador da Hito Hito no Mi: Modelo Nika.' },
    { animeSlug: 'one-piece', name: 'Roronoa Zoro', role: 'Main', about: 'Espadachim do estilo Santoryu que busca o título de maior do mundo.' },
    { animeSlug: 'attack-on-titan', name: 'Eren Yeager', role: 'Main', about: 'Portador do Titã de Ataque, Titã Fundador e Titã Martelo de Guerra.' },
    { animeSlug: 'attack-on-titan', name: 'Levi Ackerman', role: 'Supporting', about: 'Capitão da Tropa de Exploração conhecido como o soldado mais forte da humanidade.' },
    { animeSlug: 'jujutsu-kaisen', name: 'Satoru Gojo', role: 'Supporting', about: 'O Feiticeiro Jujutsu mais poderoso da era moderna, mestre do Ilimitado e Seis Olhos.' },
    { animeSlug: 'jujutsu-kaisen', name: 'Ryomen Sukuna', role: 'Antagonist', about: 'O Rei das Maldições e senhor do Santuário Malevolente.' },
    { animeSlug: 'death-note', name: 'Light Yagami', role: 'Main', about: 'Estudante brilhante que assume o alter-ego de Kira.' },
    { animeSlug: 'death-note', name: 'L Lawliet', role: 'Main', about: 'O maior detective do mundo, adversário intelectual de Kira.' },
  ];

  for (const char of characters) {
    const animeId = animeMap.get(char.animeSlug);
    if (animeId) {
      await client.query(
        `INSERT INTO anime_characters (anime_id, name, role, about)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING;`,
        [animeId, char.name, char.role, char.about]
      );
    }
  }

  console.log('[SEED:002] Concluído com sucesso.');
};

export default runSeed;