import type { CollectionConfig } from 'payload'

import { revalidateCollection, TAGS } from '@/lib/revalidate'

type LexicalNode = { text?: string; children?: LexicalNode[] }

const countWords = (node: LexicalNode | undefined): number =>
  (node?.text?.split(/\s+/).filter(Boolean).length ?? 0) +
  (node?.children ?? []).reduce((sum, child) => sum + countWords(child), 0)

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'date'],
  },
  defaultSort: '-date',
  hooks: {
    afterChange: [revalidateCollection(TAGS.articles)],
    afterDelete: [revalidateCollection(TAGS.articles)],
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'excerpt', type: 'textarea', localized: true },
    { name: 'cover', type: 'upload', relationTo: 'media' },
    { name: 'body', type: 'richText', localized: true },
    {
      name: 'readingTime',
      type: 'number',
      localized: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Minutes, calculated from the body on save',
      },
      hooks: {
        beforeChange: [
          ({ siblingData }) => Math.max(1, Math.ceil(countWords(siblingData.body?.root) / 200)),
        ],
      },
    },
    { name: 'author', type: 'text' },
    { name: 'date', type: 'date', required: true, index: true },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      required: true,
      index: true,
    },
  ],
}
