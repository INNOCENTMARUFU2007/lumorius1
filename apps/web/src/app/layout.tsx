import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Lumorius AI — The AI Operating System For Modern Businesses',
  description:
    'Combine AI Company Brain and Founder OS into one unified platform. Company Memory, Executive Assistant, Strategic Advisor, and more.',
  keywords: 'AI, SaaS, Business Intelligence, Company Brain, Founder OS',
  openGraph: {
    title: 'Lumorius AI',
    description: 'The AI Operating System For Modern Businesses',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
