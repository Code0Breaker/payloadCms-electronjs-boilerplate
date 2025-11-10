// storage-adapter-import-placeholder
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import fs from 'fs'

import { Users } from './collections/Users'
import { Media } from './collections/Media'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Resolve database path - works in both dev and production
// In production, process.cwd() will be the unpacked directory
const getDbPath = () => {
  // Try to find db.db in the current working directory or config directory
  const cwdDbPath = path.resolve(process.cwd(), 'db.db')
  const configDbPath = path.resolve(dirname, 'db.db')

  // Use the one that exists, or default to cwd for production
  if (fs.existsSync(cwdDbPath)) {
    return `file:${cwdDbPath}`
  }
  if (fs.existsSync(configDbPath)) {
    return `file:${configDbPath}`
  }
  // Default to cwd (production) or config dir (dev)
  return `file:${path.resolve(process.cwd(), 'db.db')}`
}

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media],
  editor: lexicalEditor(),
  secret: 'eeeeeeeeeeee',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: getDbPath(),
    },
  }),
  sharp,
  plugins: [
    payloadCloudPlugin(),
    // storage-adapter-placeholder
  ],
})
