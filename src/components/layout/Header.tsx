import { Link, useLocation, useNavigate } from 'react-router-dom';

const logoUrl = 'https://www.solucioneslaser.com/wp-content/uploads/2022/07/logo-web.png';

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
    <header className="relative z-10 border-b border-white/10 bg-brand-navy/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-4">
          <div className="rounded-2xl bg-white px-3 py-2 shadow-soft">
            <img src={logoUrl} alt="Soluciones Laser" className="h-8 w-auto sm:h-9" />
          </div>

          <div className="space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-sand">
              Portal de recepcion
            </span>
            <span className="block text-sm font-medium text-white sm:text-base">Acuse de recibo de factura</span>
          </div>
        </Link>

        <button
          type="button"
          onClick={handleExit}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/84 transition-colors hover:border-brand-sand hover:text-white"
        >
          Salir
        </button>
      </div>
    </header>
  );
}

export default Header;
