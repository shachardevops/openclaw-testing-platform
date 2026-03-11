import './globals.css';
import { ErrorBoundary } from '@/components/error-boundary';

export const metadata = {
  title: 'OpenClaw Dashboard',
  description: 'Multi-Agent Orchestration Platform powered by OpenClaw',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg text-white font-sans min-h-screen overflow-x-hidden" suppressHydrationWarning>
        {/* Glow orbs */}
        <div className="fixed w-[600px] h-[600px] rounded-full blur-[120px] opacity-[0.07] pointer-events-none -z-10 bg-accent -top-[200px] -right-[100px]" />
        <div className="fixed w-[500px] h-[500px] rounded-full blur-[120px] opacity-[0.07] pointer-events-none -z-10 bg-purple-400 -bottom-[100px] -left-[100px]" />
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
