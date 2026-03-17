import { Link } from 'react-router-dom';

function Header() {
  return (
    <header className="border-b border-brand-border bg-brand-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-3">
          <span className="inline-flex h-8 items-center rounded-md border border-brand-border bg-brand-surface px-2.5 text-xs font-bold tracking-wide text-brand-ink">
            DANAconnect
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-brand-muted sm:text-sm">Acuse de recibo</span>
        </Link>

        <a
          href="mailto:soporte@danaconnect.com"
          className="text-sm font-medium text-brand-muted transition-colors hover:text-brand-ink"
        >
          Ayuda
        </a>
      </div>
    </header>
  );
}

export default Header;
