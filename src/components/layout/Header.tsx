import { Link } from 'react-router-dom';

const logoUrl = '/brand/logo-soluciones-laser.png';

function Header() {
  return (
    <header className="border-b border-brand-border bg-brand-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-3">
          <img src={logoUrl} alt="Soluciones Laser" className="h-10 w-auto" />
        </Link>
      </div>
    </header>
  );
}

export default Header;
