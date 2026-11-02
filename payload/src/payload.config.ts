import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Articles } from './collections/Articles'
import { Categories } from './collections/Categories'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Menu } from './globals/Menu'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Categories, Articles, Users, Media],
  globals: [Menu],
  editor: lexicalEditor(),
  localization: {
    locales: [
      { label: 'English', code: 'en' },
      { label: 'Українська', code: 'uk' },
    ],
    defaultLocale: 'en',
    fallback: false,
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
      max: Number(process.env.DATABASE_POOL_MAX) || 10,
    },
    // Production (NODE_ENV=production) applies pending migrations on startup.
    prodMigrations: migrations,
  }),
  sharp,
  plugins: [],
})
