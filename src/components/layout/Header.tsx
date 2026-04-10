import { Link, useLocation, useNavigate } from 'react-router-dom';

const logoUrl = '/brand/logo-soluciones-laser.png';

function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleExit = () => {
    if (location.pathname === '/') {
      window.location.reload();
      return;
    }
    navigate('/', { replace: true });
  };

  return (
    <header className="border-b border-brand-border bg-brand-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-3">
          <span className="inline-flex h-10 items-center rounded-md bg-brand-ink px-3">
            <img src={logoUrl} alt="Soluciones Laser" className="h-7 w-auto" />
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-brand-muted sm:text-sm">Acuse de recibo</span>
        </Link>

        <button
          type="button"
          onClick={handleExit}
          className="text-sm font-medium text-brand-muted transition-colors hover:text-brand-ink"
        >
          Salir
        </button>
      </div>
    </header>
  );
}

export default Header;
