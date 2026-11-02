import type { Core } from '@strapi/strapi';

type BlockNode = { text?: string; children?: BlockNode[] };

const countWords = (nodes: BlockNode[] | undefined): number =>
  (nodes ?? []).reduce(
    (sum, node) => sum + (node.text?.split(/\s+/).filter(Boolean).length ?? 0) + countWords(node.children),
    0,
  );

// Read access for the site (the Astro frontend calls the REST API without a token).
const PUBLIC_ACTIONS = [
  'api::article.article.find',
  'api::article.article.findOne',
  'api::category.category.find',
  'api::category.category.findOne',
  'api::menu.menu.find',
];

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    // readingTime = words / 200, rounded up, at least 1 (same rule as the Payload hook).
    strapi.documents.use(async (ctx, next) => {
      if (ctx.uid === 'api::article.article' && (ctx.action === 'create' || ctx.action === 'update')) {
        const data = (ctx.params as { data?: { body?: BlockNode[]; readingTime?: number } }).data;
        if (data?.body) data.readingTime = Math.max(1, Math.ceil(countWords(data.body) / 200));
      }
      return next();
    });
  },

  // Runs on every start, so the dev database and strapi_bench get the same setup.
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const locales = strapi.plugin('i18n').service('locales');
    if (!(await locales.findByCode('uk'))) await locales.create({ code: 'uk', name: 'Ukrainian (uk)' });

    const publicRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });
    const permissions = strapi.db.query('plugin::users-permissions.permission');
    for (const action of PUBLIC_ACTIONS) {
      if (!(await permissions.findOne({ where: { action, role: publicRole.id } }))) {
        await permissions.create({ data: { action, role: publicRole.id } });
      }
    }
  },
};
