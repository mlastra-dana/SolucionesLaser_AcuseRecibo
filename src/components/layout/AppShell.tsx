import { ReactNode } from 'react';
import Footer from './Footer';
import Header from './Header';

type AppShellProps = {
  children: ReactNode;
};

function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-brand-background text-brand-ink">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(135deg,rgba(16,33,58,0.98),rgba(20,35,61,0.86)_58%,rgba(216,108,52,0.28))]" />
      <div className="pointer-events-none absolute left-[-8rem] top-24 h-64 w-64 rounded-full bg-brand-orange/20 blur-3xl" />
      <div className="pointer-events-none absolute right-[-6rem] top-48 h-72 w-72 rounded-full bg-brand-sand/60 blur-3xl" />
      <Header />
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      <Footer />
    </div>
  );
}

export default AppShell;
