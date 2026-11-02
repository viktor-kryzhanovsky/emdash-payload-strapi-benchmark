// Loads ../data/articles.json (the same dataset as the Payload and EmDash sites) through
// Strapi's Document Service. Upserts by slug, so it can be re-run.
//
//   pnpm seed                               -> database from .env (DATABASE_NAME=strapi)
//   DATABASE_NAME=strapi_bench pnpm seed    -> benchmark database
//
// readingTime is filled by the document middleware in src/index.ts.
// CommonJS: importing @strapi/strapi as ESM fails (its ESM build imports named exports from lodash).
const { statSync } = require('node:fs');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { compileStrapi, createStrapi } = require('@strapi/strapi');

const DATA_FILE = process.env.SEED_FILE || path.resolve('../data/articles.json');

// Minimal Strapi blocks document: one paragraph per string.
const blocks = (paragraphs) =>
  paragraphs.map((text) => ({ type: 'paragraph', children: [{ type: 'text', text }] }));

async function main() {
  const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  const [first, ...rest] = data.locales;

  const app = await createStrapi(await compileStrapi()).load();
  app.log.level = 'error';

  const docs = (uid) => app.documents(uid);
  const findBySlug = (uid, slug) => docs(uid).findFirst({ filters: { slug }, locale: first });

  try {
    // Covers are uploaded once; a re-run finds them by file name.
    const coverIds = {};
    for (const c of data.covers) {
      const name = path.basename(c.file);
      let file = await app.db.query('plugin::upload.file').findOne({ where: { name } });
      if (!file) {
        const filepath = path.resolve(path.dirname(DATA_FILE), c.file);
        [file] = await app
          .plugin('upload')
          .service('upload')
          .upload({
            data: { fileInfo: { name, alternativeText: c.alt } },
            files: { filepath, originalFilename: name, mimetype: 'image/jpeg', size: statSync(filepath).size },
          });
      }
      coverIds[c.file] = file.id;
    }

    const categoryIds = {};
    for (const c of data.categories) {
      const existing = await findBySlug('api::category.category', c.slug);
      const doc = existing
        ? await docs('api::category.category').update({
            documentId: existing.documentId,
            locale: first,
            data: { title: c.title[first] },
          })
        : await docs('api::category.category').create({
            locale: first,
            data: { title: c.title[first], slug: c.slug },
          });
      // update() with another locale creates or updates that localization of the same document.
      for (const locale of rest) {
        await docs('api::category.category').update({
          documentId: doc.documentId,
          locale,
          data: { title: c.title[locale], slug: c.slug },
        });
      }
      categoryIds[c.key] = doc.documentId;
    }

    // Menu: one item per category, only if it is still empty (keeps manual edits).
    const menu = await docs('api::menu.menu').findFirst({ locale: first, populate: ['items'] });
    if (!menu?.items?.length) {
      for (const locale of data.locales) {
        const items = data.categories.map((c) => ({ label: c.title[locale], url: `/${locale}/category/${c.slug}` }));
        const current = await docs('api::menu.menu').findFirst({ locale });
        if (current) await docs('api::menu.menu').update({ documentId: current.documentId, locale, data: { items } });
        else await docs('api::menu.menu').create({ locale, data: { items } });
      }
    }

    for (const a of data.articles) {
      // Relations are per locale: each localization links to the same category document.
      const shared = {
        slug: a.slug,
        author: a.author,
        date: a.publishedAt,
        cover: coverIds[a.cover],
        category: categoryIds[a.category],
      };
      const localized = (locale) => ({
        title: a.locales[locale].title,
        excerpt: a.locales[locale].excerpt,
        body: blocks(a.locales[locale].body),
      });
      const existing = await findBySlug('api::article.article', a.slug);
      const doc = existing
        ? await docs('api::article.article').update({
            documentId: existing.documentId,
            locale: first,
            data: { ...localized(first), ...shared },
          })
        : await docs('api::article.article').create({ locale: first, data: { ...localized(first), ...shared } });
      for (const locale of rest) {
        await docs('api::article.article').update({
          documentId: doc.documentId,
          locale,
          data: { ...localized(locale), ...shared },
        });
      }
    }

    const total = await app.db.query('api::article.article').count();
    console.log(
      `seeded ${data.articles.length} articles x ${data.locales.length} locales (${total} rows in articles), ` +
        `${Object.keys(coverIds).length} covers`,
    );
  } finally {
    await app.destroy();
}
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
