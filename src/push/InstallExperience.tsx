import { CheckCircle2, Download, LoaderCircle, PlusSquare, Share } from 'lucide-react';
import type { usePwa } from './usePwa';

export default function InstallExperience({ pwa }: { pwa: ReturnType<typeof usePwa> }) {
  return <div className="install-experience">
    {pwa.canInstall && <button className="install-button" onClick={() => void pwa.install()} disabled={pwa.installing} aria-label="Instalar DANA Push Experience">
      {pwa.installing ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />} Instalar aplicación
    </button>}
    {pwa.installed && <p className="installed-state"><CheckCircle2 size={16} /> Aplicación instalada</p>}
    {pwa.showIosInstructions && <details className="ios-install-guide">
      <summary><Share size={17} /> Instalar DANA Push Experience en iPhone o iPad</summary>
      <ol><li>Abre esta página en Safari.</li><li>Pulsa <Share size={14} /> Compartir.</li><li>Selecciona <PlusSquare size={14} /> Añadir a pantalla de inicio.</li><li>Activa Abrir como app, si aparece.</li><li>Pulsa Añadir y abre DANA Push desde su icono.</li></ol>
    </details>}
    {pwa.error && <p role="status" className="pwa-status">{pwa.error}</p>}
    {!pwa.online && <p role="status" className="pwa-status">Sin conexión. Puedes consultar los mensajes guardados; el registro y la recepción de nuevos Push requieren conexión.</p>}
  </div>;
}
