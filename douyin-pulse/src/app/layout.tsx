import type { Metadata } from 'next';
import { Inter, Share_Tech_Mono, Nunito } from 'next/font/google';
import './globals.css';
import QueryProvider from '@/components/query-provider'; 

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const techMono = Share_Tech_Mono({ weight: '400', subsets: ['latin'], variable: '--font-mono' });
const nunito = Nunito({ weight: ['400', '600', '700', '900'], subsets: ['latin'], variable: '--font-cute' });

export const metadata: Metadata = {
  title: 'TERMINAL // 1103',
  description: 'Tactical Live Monitoring Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.variable} ${techMono.variable} ${nunito.variable} min-h-screen custom-scrollbar transition-colors duration-500`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  if (localStorage.getItem('app-theme') === 'pink') {
                    document.documentElement.classList.add('theme-pink');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}