import type { CollectionConfig } from 'payload'

import { revalidateCollection, TAGS } from '@/lib/revalidate'

export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    useAsTitle: 'title',
  },
  hooks: {
    afterChange: [revalidateCollection(TAGS.categories)],
    afterDelete: [revalidateCollection(TAGS.categories)],
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
  ],
}