import type { CollectionConfig } from 'payload'

import { revalidateCollection, TAGS } from '@/lib/revalidate'

export const Media: CollectionConfig = {
  slug: 'media',
  hooks: {
    afterChange: [revalidateCollection(TAGS.media)],
    afterDelete: [revalidateCollection(TAGS.media)],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
