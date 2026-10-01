import { useEffect, useState } from 'react';
import { registerSharedWorker } from '../services/serviceWorkerService';
import { isAppleMobile, isStandalone } from './platform';

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function usePwa() {
  const [installed, setInstalled] = useState(isStandalone);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let hadController = Boolean(navigator.serviceWorker?.controller);
    const media = window.matchMedia('(display-mode: standalone)');
    const offerInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const installationFinished = () => { setInstalled(true); setPrompt(null); };
    const modeChanged = () => setInstalled(isStandalone());
    const connectionChanged = () => setOnline(navigator.onLine);
    const controllerChanged = () => {
      if (hadController && !import.meta.env.DEV) window.location.reload();
      hadController = true;
    };
    window.addEventListener('beforeinstallprompt', offerInstall);
    window.addEventListener('appinstalled', installationFinished);
    window.addEventListener('online', connectionChanged);
    window.addEventListener('offline', connectionChanged);
    media.addEventListener('change', modeChanged);
    navigator.serviceWorker?.addEventListener('controllerchange', controllerChanged);
    // Installing the shared worker is independent of notification consent. No token or permission is requested here.
    void registerSharedWorker().catch(() => {
      if (!cancelled) setError('No pudimos preparar la instalación. Comprueba la conexión y recarga la página.');
    });
    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', offerInstall);
      window.removeEventListener('appinstalled', installationFinished);
      window.removeEventListener('online', connectionChanged);
      window.removeEventListener('offline', connectionChanged);
      media.removeEventListener('change', modeChanged);
      navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged);
    };
  }, []);

  async function install() {
    if (!prompt || installing) return;
    setInstalling(true);
    setError('');
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      // appinstalled/display-mode confirm installation; accepting the dialog alone is not a completion signal.
      if (choice.outcome === 'accepted') setPrompt(null);
    } catch { setError('La instalación no pudo completarse. Vuelve a intentarlo desde el menú del navegador.'); }
    finally { setPrompt(null); setInstalling(false); }
  }

  return { installed, canInstall: Boolean(prompt) && !installed, installing, install, online, error,
    showIosInstructions: isAppleMobile() && !installed };
}
