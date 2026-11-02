import type { Metadata } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import { notFound } from 'next/navigation'
import React from 'react'

import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { getMenu } from '@/lib/data'
import { isLocale } from '@/lib/i18n'
import '../styles.css'

// Fonts are downloaded at build time and served by Next itself (no Google requests at runtime).
const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' })
const montserrat = Montserrat({ subsets: ['latin', 'cyrillic'], weight: '800', variable: '--font-montserrat' })

// No cache: every request renders on the server and queries the database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Blog',
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const menu = await getMenu(locale)

  return (
    <html lang={locale} className={`${inter.variable} ${montserrat.variable}`}>
      <body>
        <Header locale={locale} menu={menu} />
        <main className="container">{children}</main>
        <Footer locale={locale} menu={menu} />
      </body>
    </html>
  )
}
