import { ReactNode } from 'react';
import Footer from './Footer';
import Header from './Header';

type AppShellProps = {
  children: ReactNode;
};

function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-background">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      <Footer />
    </div>
  );
}

export default AppShell;
