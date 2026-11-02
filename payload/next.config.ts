import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // Self-contained server (server.js + minimal node_modules) for the Docker image.
  output: 'standalone',
  poweredByHeader: false,
  async redirects() {
    return [{ source: '/', destination: '/en', permanent: false }]
  },
  // CMS_CACHE=page (build time): serve pages from the statically rendered (cached) route group,
  // keeping the public URLs. ?page=n becomes a path segment there. Search is not cached.
  async rewrites() {
    if (process.env.CMS_CACHE !== 'page') return []
    const locale = ':locale(en|uk)'
    return {
      beforeFiles: [
        { source: `/${locale}`, destination: '/cached/:locale' },
        { source: `/${locale}/articles/:slug`, destination: '/cached/:locale/articles/:slug' },
        {
          source: `/${locale}/category/:slug`,
          has: [{ type: 'query', key: 'page', value: '(?<page>\\d+)' }],
          destination: '/cached/:locale/category/:slug/page/:page',
        },
        { source: `/${locale}/category/:slug`, destination: '/cached/:locale/category/:slug/page/1' },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
