// Deterministic dataset generator: identical content for every CMS.
// Usage: node data/generate.mjs  ->  data/articles.json
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCALES = ['en', 'uk'];
const DEFAULT_LOCALE = 'en';
const ARTICLES_PER_CATEGORY = 10;
const PAGE_SIZE = 6;

// Same slugs as the categories created by hand in the Payload admin.
const CATEGORIES = [
  { key: 'activities', slug: 'activities', title: { en: 'Activities', uk: 'Активності' } },
  { key: 'education', slug: 'education', title: { en: 'Education', uk: 'Навчання' } },
];

// Images from data/generate-covers.mjs, assigned to articles round-robin.
const COVERS = Array.from({ length: 6 }, (_, i) => ({
  file: `covers/cover-${i + 1}.jpg`,
  alt: `Abstract cover ${i + 1}`,
}));

// Topic words double as search terms, so search always has hits.
const TOPICS = {
  en: ['bitcoin', 'ethereum', 'staking', 'wallet', 'security', 'trading'],
  uk: ['біткоїн', 'ефіріум', 'стейкінг', 'гаманець', 'безпека', 'трейдинг'],
};
const TITLE_PARTS = {
  en: {
    a: ['Complete', 'Practical', 'Weekly', 'Essential', 'Advanced', 'Quick'],
    b: ['overview of', 'guide to', 'update on', 'notes about', 'insights into', 'look at'],
  },
  uk: {
    a: ['Повний', 'Практичний', 'Тижневий', 'Основний', 'Поглиблений', 'Швидкий'],
    b: ['огляд теми', 'посібник про', 'апдейт про', 'нотатки про', 'аналіз теми', 'погляд на'],
  },
};
const WORDS = {
  en: 'market price volume order book liquidity exchange token network fee block chain asset user account deposit withdrawal limit spot futures margin risk strategy analysis trend support resistance signal portfolio balance'.split(' '),
  uk: 'ринок ціна обсяг ордер книга ліквідність біржа токен мережа комісія блок ланцюг актив користувач акаунт депозит виведення ліміт спот фʼючерси маржа ризик стратегія аналіз тренд підтримка опір сигнал портфель баланс'.split(' '),
};

// mulberry32: tiny seeded PRNG
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));

function sentence(locale) {
  const words = Array.from({ length: int(8, 16) }, () => pick(WORDS[locale]));
  const s = words.join(' ');
  return s[0].toUpperCase() + s.slice(1) + '.';
}
const paragraph = (locale) => Array.from({ length: int(3, 6) }, () => sentence(locale)).join(' ');

const articles = [];
const start = Date.UTC(2026, 9, 1, 9, 0, 0);
let n = 0;
for (const category of CATEGORIES) {
  for (let i = 0; i < ARTICLES_PER_CATEGORY; i++) {
    n++;
    const topicIdx = int(0, TOPICS.en.length - 1);
    const a = int(0, 5);
    const b = int(0, 5);
    const paragraphs = int(6, 10);
    const article = {
      key: `a${String(n).padStart(2, '0')}`,
      slug: `article-${String(n).padStart(2, '0')}`,
      category: category.key,
      author: 'WhiteBIT Research',
      publishedAt: new Date(start - n * 86_400_000).toISOString(),
      cover: COVERS[(n - 1) % COVERS.length].file,
      locales: {},
    };
    for (const locale of LOCALES) {
      const p = TITLE_PARTS[locale];
      article.locales[locale] = {
        title: `${p.a[a]} ${p.b[b]} ${TOPICS[locale][topicIdx]} #${n}`,
        excerpt: sentence(locale),
        body: Array.from({ length: paragraphs }, () => paragraph(locale)),
      };
    }
    articles.push(article);
  }
}

const dataset = {
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  pageSize: PAGE_SIZE,
  categories: CATEGORIES,
  covers: COVERS,
  articles,
  // last term per locale intentionally has no results
  searchTerms: Object.fromEntries(LOCALES.map((l) => [l, [...TOPICS[l], 'zzznoresults']])),
};

const out = fileURLToPath(new URL('./articles.json', import.meta.url));
writeFileSync(out, JSON.stringify(dataset, null, 2) + '\n');
console.log(`wrote ${articles.length} articles x ${LOCALES.length} locales -> ${out}`);
