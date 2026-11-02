import type { GlobalConfig } from 'payload'

import { revalidateGlobal, TAGS } from '@/lib/revalidate'

export const Menu: GlobalConfig = {
  slug: 'menu',
  hooks: {
    afterChange: [revalidateGlobal(TAGS.menu)],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'items',
      type: 'array',
      maxRows: 8,
      fields: [
        { name: 'label', type: 'text', required: true, localized: true },
        {
          name: 'type',
          type: 'radio',
          defaultValue: 'category',
          options: [
            { label: 'Category', value: 'category' },
            { label: 'Custom URL', value: 'custom' },
          ],
          admin: { layout: 'horizontal' },
        },
        {
          name: 'category',
          type: 'relationship',
          relationTo: 'categories',
          required: true,
          admin: { condition: (_, siblingData) => siblingData?.type === 'category' },
        },
        {
          name: 'url',
          type: 'text',
          required: true,
          admin: { condition: (_, siblingData) => siblingData?.type === 'custom' },
        },
      ],
    },
  ],
}
