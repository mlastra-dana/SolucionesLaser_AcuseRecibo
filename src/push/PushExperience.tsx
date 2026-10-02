import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Bell, BellRing, Check, CheckCircle2, ChevronDown, Clipboard, Code2, Info, LoaderCircle, LockKeyhole, RefreshCw, Trash2, UserRound, X } from 'lucide-react';
import type { MessagePayload } from 'firebase/messaging';
import { getPushDiagnostics, listenForPushMessages, registerPushBrowser, type PushDiagnostics } from '../services/pushService';
import { registerPushVisitor, type DanaRegistrationResult, type PushVisitor } from '../services/danaService';
import { clearPushEvents, getMessageDetails, readPushEvents, recordPushEvent, type ObservedNotification, type PushEvent } from './eventStore';
import { getFirebaseConfig } from './firebaseConfig';
import { getPushCapabilities, pushUnavailableMessage, type PushCapabilities } from '../services/pushCapabilities';
import { usePwa } from './usePwa';
import InstallExperience from './InstallExperience';
import NotificationsHistory from './NotificationsHistory';

const demoMode = import.meta.env.VITE_PUSH_DEMO_MODE !== 'false';
type RegistrationStage = 'Validando información' | 'Conectando con Firebase' | 'Registrando dispositivo' | 'Enviando información a DANAconnect' | 'Preparando notificación' | 'Registro completado';

export default function PushExperience() {
  const pwa = usePwa();
  const [capabilities, setCapabilities] = useState<PushCapabilities | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<RegistrationStage | null>(null);
  const [fcmToken, setFcmToken] = useState('');
  const [danaResult, setDanaResult] = useState<DanaRegistrationResult | null>(null);
  const [error, setError] = useState('');
  const [visitor, setVisitor] = useState<PushVisitor | null>(null);
  const [resendConfirmed, setResendConfirmed] = useState(false);
  const [resendError, setResendError] = useState('');
  const [events, setEvents] = useState<PushEvent[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [latest, setLatest] = useState<MessagePayload | null>(null);
  const [latestTimestamp, setLatestTimestamp] = useState('');
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [messageContext, setMessageContext] = useState<'foreground' | 'background'>('foreground');
  const stop = useRef<(() => void) | null>(null);
  const listenerGeneration = useRef(0);
  const mounted = useRef(true);
  const seenMessages = useRef(new Set<string>());
  const nameInput = useRef<HTMLInputElement>(null);
  const successTitle = useRef<HTMLHeadingElement>(null);
  const copyTimer = useRef<number>();
  const restoredClick = useRef<string | null>(null);
  const submitting = useRef(false);

  async function refreshEvents() {
    try {
      const stored = await readPushEvents();
      setEvents(stored);
      setHistoryError('');
      const clicked = stored.find(item => item.type === 'PUSH_CLICKED' && item.context === 'background');
      if (clicked && restoredClick.current !== clicked.id) {
        restoredClick.current = clicked.id;
        setLatest(clicked.payload as unknown as MessagePayload);
        setLatestTimestamp(clicked.timestamp);
        setMessageContext('background');
        setRevealed(true);
      }
    }
    catch { setHistoryError('El historial local no está disponible en este navegador. La recepción Push puede continuar.'); }
  }

  async function refreshDiagnostics() {
    try { setDiagnostics(await getPushDiagnostics()); }
    catch { setDiagnostics(null); }
  }

  async function refreshCapabilities() {
    setCapabilities(await getPushCapabilities());
  }

  const receivePayload = useCallback((payload: MessagePayload) => {
    if (!mounted.current) return;
    if (payload.messageId && seenMessages.current.has(payload.messageId)) return;
    if (payload.messageId) {
      seenMessages.current.add(payload.messageId);
      if (seenMessages.current.size > 100) seenMessages.current.delete(seenMessages.current.values().next().value!);
    }
    setLatest(payload);
    setLatestTimestamp(new Date().toISOString());
    setMessageContext('foreground');
    setRevealed(false);
    void refreshEvents();
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshEvents();
    void refreshDiagnostics();
    void refreshCapabilities();
    let cancelled = false;
    const generation = listenerGeneration.current;
    void listenForPushMessages(receivePayload, () => !cancelled && generation === listenerGeneration.current).then(unsubscribe => {
      if (cancelled || generation !== listenerGeneration.current) unsubscribe?.();
      else stop.current = unsubscribe;
    }).catch(() => {});
    const received = (event: MessageEvent) => {
      if (event.data?.source === 'DANA_PUSH_WORKER') void refreshEvents();
    };
    const visible = () => { if (document.visibilityState === 'visible') { void refreshEvents(); void refreshDiagnostics(); void refreshCapabilities(); } };
    navigator.serviceWorker?.addEventListener('message', received);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      cancelled = true;
      stop.current?.();
      clearTimeout(copyTimer.current);
      navigator.serviceWorker?.removeEventListener('message', received);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [receivePayload]);

  useEffect(() => { if (visitor) { successTitle.current?.focus(); setStage('Registro completado'); } }, [visitor]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setStage('Validando información');
    setError('');
    const details = { nombre: nombre.trim(), email: email.trim(), telefono: telefono.trim() };
    if (!consent) { setError('Acepta recibir una notificación de prueba para continuar.'); return; }
    if (!pwa.online) { setError('Conéctate a Internet para registrar el navegador y generar tu token.'); return; }
    submitting.current = true;
    setBusy(true);
    try {
      if (capabilities && !capabilities.supported) throw new Error(pushUnavailableMessage(capabilities.reason));
      let token = fcmToken;
      if (!token) {
        listenerGeneration.current++;
        stop.current?.();
        stop.current = null;
        const result = await registerPushBrowser(receivePayload, capabilities ?? undefined, setStage);
        if (!mounted.current) { result.unsubscribe(); return; }
        stop.current = result.unsubscribe;
        token = result.token;
        setFcmToken(token);
      } else if ('Notification' in window && Notification.permission !== 'granted') {
        throw new Error('El permiso de notificaciones cambió. Habilítalo en los ajustes del sitio antes de reintentar.');
      }
      const registered = { ...details, token };
      setStage('Enviando información a DANAconnect');
      const result = await registerPushVisitor(registered);
      if (!mounted.current) return;
      setDanaResult(result);
      setStage('Preparando notificación');
      setVisitor(registered);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos preparar tu navegador. Revisa tu conexión y vuelve a intentarlo.');
    } finally {
      submitting.current = false;
      if (mounted.current) { setBusy(false); void refreshDiagnostics(); }
    }
  }

  async function copyToken() {
    if (!fcmToken) return;
    try {
      await navigator.clipboard.writeText(fcmToken);
      setCopied(true);
      setCopyError('');
      clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2500);
    } catch { setCopyError('No pudimos copiar el token. Selecciona el texto y cópialo desde el campo.'); }
  }

  async function resend() {
    if (!visitor || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setResendError('');
    setResendConfirmed(false);
    setDanaResult(null);
    try {
      if (!pwa.online) throw new Error('Conéctate a Internet para reenviar la notificación.');
      if ('Notification' in window && Notification.permission !== 'granted') {
        throw new Error('Habilita las notificaciones en los ajustes del sitio antes de reenviar.');
      }
      const result = await registerPushVisitor(visitor);
      if (!mounted.current) return;
      setDanaResult(result);
      setResendConfirmed(true);
    } catch (cause) {
      if (mounted.current) setResendError(cause instanceof Error ? cause.message : 'No pudimos solicitar el reenvío. Revisa tu conexión.');
    } finally {
      submitting.current = false;
      if (mounted.current) { setBusy(false); void refreshDiagnostics(); }
    }
  }

  async function openMessage() {
    if (!latest) return;
    setRevealed(true);
    try {
      const payload = latest as unknown as Record<string, unknown>;
      if (messageContext === 'foreground') await recordPushEvent('PUSH_CLICKED', 'foreground', payload);
      await recordPushEvent('PUSH_OPENED', 'foreground', payload);
      await refreshEvents();
    } catch { setHistoryError('El mensaje se abrió, pero no pudimos guardar el evento local.'); }
  }

  async function openHistoryMessage(message: ObservedNotification) {
    setLatest(message.payload as unknown as MessagePayload);
    setLatestTimestamp(message.timestamp);
    setMessageContext(message.context);
    setRevealed(true);
    try {
      await recordPushEvent('PUSH_OPENED', 'foreground', message.payload);
      await refreshEvents();
    } catch { setHistoryError('El mensaje se abrió, pero no pudimos guardar el evento local.'); }
  }

  function clearHistory() {
    void clearPushEvents().then(() => {
      setLatest(null);
      return refreshEvents();
    }).catch(() => setHistoryError('No pudimos borrar el historial local.'));
  }

  const firebaseConfig = getFirebaseConfig();
  const lastReceived = events.find(item => item.type === 'PUSH_RECEIVED');
  const lastPayload = lastReceived?.payload ?? (latest as unknown as Record<string, unknown> | null);
  const lastDetails = lastPayload ? getMessageDetails(lastPayload) : null;
  const latestDetails = latest ? getMessageDetails(latest as unknown as Record<string, unknown>) : null;

  return (
    <div className="push-app">
      <header className="push-header">
        <a className="brand" href="/" aria-label="DANAconnect Push Experience"><img src="/brand/logo-danaconnect-horizontal.png" width="1024" height="417" alt="DANAconnect" /></a>
        <span className="demo-badge"><span /> DEMO INTERACTIVA</span>
      </header>

      <main>
        <section className="experience-section" aria-labelledby="experience-title">
          <div className="experience-masthead">
          <div className="intro">
            <div className="hero-bell"><Bell size={27} strokeWidth={1.7} aria-hidden="true" /></div>
            <p className="eyebrow">CONEXIONES QUE LLEGAN AL INSTANTE</p>
            <h1 id="experience-title">¡Experimenta el poder de las <span>notificaciones Push!</span></h1>
            <p className="intro-description">Descubre cómo DANAconnect permite conectar con tus clientes mediante notificaciones instantáneas, directamente en sus dispositivos.</p>
          </div>

          <InstallExperience pwa={pwa} />
          {capabilities && !capabilities.supported && <p className="push-compatibility-note" role="status"><Info size={16} />{pushUnavailableMessage(capabilities.reason)}</p>}
          </div>

          <div className="registration-panel">
            {!visitor ? (
              <form onSubmit={submit} noValidate aria-busy={busy}>
                <div className="panel-heading"><span className="panel-icon"><UserRound size={20} /></span><div><h2>Tu experiencia comienza aquí</h2><p>Prepara tu navegador para tu primera notificación.</p></div></div>
                <fieldset disabled={busy}>
                  <div className="name-fields">
                    <label className="full-width-field" htmlFor="nombre">Nombre completo<input ref={nameInput} id="nombre" name="nombre" autoComplete="name" maxLength={120} value={nombre} onChange={event => setNombre(event.target.value)} placeholder="Tu nombre completo" /></label>
                    <label htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="nombre@empresa.com" /></label>
                    <label htmlFor="telefono">Teléfono<input id="telefono" name="telefono" type="tel" autoComplete="tel" value={telefono} onChange={event => setTelefono(event.target.value)} placeholder="Tu teléfono" /></label>
                  </div>
                  <label className="consent" htmlFor="consent"><input id="consent" type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Acepto recibir una notificación de prueba en este navegador</span></label>
                  {error && <div id="registration-error" className="error-message" role="alert"><Info size={18} /><span>{error}</span></div>}
                  <button className="primary-button" type="submit" disabled={busy || !capabilities}>{busy ? <LoaderCircle className="spin" size={19} /> : <Bell size={19} />}<span>Registrarme y recibir mi Push</span>{!busy && <ArrowRight size={19} />}</button>
                </fieldset>
                {busy && <p className="registration-progress" role="status" aria-live="polite">{stage}…</p>}
                <p className="privacy-note"><LockKeyhole size={13} /> Tus datos se usan únicamente para esta demostración.</p>
              </form>
            ) : (
              <div className="success-panel" aria-busy={busy}>
                <div className="success-icon"><Check size={27} /></div>
                <h2 ref={successTitle} tabIndex={-1}>{visitor.nombre ? `¡Todo listo, ${visitor.nombre}!` : '¡Todo listo!'}</h2>
                <p>Tu registro se procesó correctamente. Puedes solicitar otra notificación Push con los mismos datos.</p>
                <ul className="status-list">{['Navegador compatible', 'Notificaciones habilitadas', 'Firebase conectado', 'Token generado'].map(label => <li key={label}><CheckCircle2 size={17} />{label}</li>)}</ul>
                <div className="ready-status" role="status"><CheckCircle2 size={15} />{resendConfirmed ? 'Reenvío solicitado' : 'Registro completado'}</div>
                {resendError && <div className="error-message" role="alert"><Info size={18} /><span>{resendError}</span></div>}
                <button className="secondary-button resend-button" disabled={busy} onClick={() => void resend()}>{busy ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}{busy ? 'Solicitando reenvío…' : 'Reenviar notificación'}</button>
                {busy && <p className="registration-progress" role="status">Enviando información a DANAconnect…</p>}
              </div>
            )}
          </div>

          {latest && latestDetails && <aside className="message-banner" aria-live="polite"><BellRing size={23} /><div><small>{messageContext === 'foreground' ? 'MENSAJE OBSERVADO · PRIMER PLANO' : 'MENSAJE OBSERVADO · SEGUNDO PLANO'}</small><h3>Tu notificación</h3><h4>{latestDetails.title}</h4><p>{latestDetails.body || 'Sin cuerpo de mensaje'}</p>{revealed && <>{latestDetails.image && <img key={latestDetails.image} className="message-image" src={latestDetails.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}<p>Message ID: {latest.messageId || 'No disponible'}</p><p>{latestTimestamp}</p><pre>{JSON.stringify(latest, null, 2)}</pre></>}</div><button title="Abrir mensaje" aria-label="Abrir mensaje" className="icon-button" onClick={() => void openMessage()}><ArrowRight size={18} /></button><button title="Cerrar mensaje" aria-label="Cerrar mensaje" className="icon-button" onClick={() => setLatest(null)}><X size={18} /></button></aside>}

          {demoMode && <NotificationsHistory events={events} onOpen={message => void openHistoryMessage(message)} onRefresh={() => void refreshEvents()} onClear={clearHistory} />}

          {demoMode && <details className="diagnostics">
            <summary><Code2 size={16} /><span>Información de diagnóstico</span><span className="diagnostic-state">{fcmToken ? 'Token disponible' : 'Sin registrar'}</span><ChevronDown size={15} /></summary>
            <div className="diagnostic-content">
              <dl className="diagnostic-values">
                <dt>Firebase Project ID</dt><dd>{firebaseConfig.projectId || 'Sin configurar'}</dd>
                <dt>Firebase App ID</dt><dd>{firebaseConfig.appId || 'Sin configurar'}</dd>
                <dt>Estado del permiso</dt><dd>{diagnostics?.permission || 'No disponible'}</dd>
                <dt>Estado del Service Worker</dt><dd>{diagnostics?.workerState || 'No disponible'}</dd>
                <dt>Ruta del Service Worker</dt><dd>{diagnostics?.workerScript || 'Sin registrar'}</dd>
                <dt>Alcance</dt><dd>{diagnostics?.workerScope || 'Sin registrar'}</dd>
                <dt>Modo de aplicación</dt><dd>{pwa.installed ? 'Instalada / standalone' : 'Navegador'}</dd>
                <dt>Notifications / Push API</dt><dd>{capabilities ? `${capabilities.notifications ? 'Disponible' : 'No disponible'} / ${capabilities.pushApi ? 'Disponible' : 'No disponible'}` : 'Comprobando'}</dd>
                <dt>Soporte Firebase Messaging</dt><dd>{capabilities ? (capabilities.firebase ? 'Disponible' : 'No disponible') : 'Comprobando'}</dd>
              </dl>
              <p><strong>Token FCM:</strong> {fcmToken ? 'Generado por Firebase para este navegador y origen.' : 'Pendiente de registro.'}</p>
              {fcmToken && <><label className="token-label" htmlFor="token">Token del navegador</label><textarea id="token" readOnly value={fcmToken} rows={3} spellCheck={false} /><div className="diagnostic-actions"><button className="secondary-button" onClick={() => void copyToken()}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Token copiado' : 'Copiar token'}</button></div>{copyError && <p role="alert">{copyError}</p>}</>}
              <p>Start Conversation: {danaResult ? 'inicio confirmado por Lambda; no confirma entrega del Push.' : import.meta.env.VITE_DANA_PUSH_API_URL ? 'sin confirmación de inicio.' : 'sin URL de Lambda configurada.'}</p>
              {danaResult?.resultId !== undefined && <p>Result ID: {danaResult.resultId}</p>}
              <h3>Último mensaje recibido</h3>
              {lastPayload && lastDetails ? <dl className="diagnostic-values"><dt>Message ID</dt><dd>{lastReceived?.messageId || (typeof lastPayload.messageId === 'string' ? lastPayload.messageId : 'No disponible')}</dd><dt>Título</dt><dd>{lastDetails.title}</dd><dt>Cuerpo</dt><dd>{lastDetails.body || 'No disponible'}</dd>{lastDetails.image && <><dt>Imagen</dt><dd>{lastDetails.image}</dd></>}<dt>Timestamp</dt><dd>{lastReceived?.timestamp || latestTimestamp}</dd></dl> : <p>Todavía no hay mensajes recibidos en este navegador.</p>}
              <div className="history-heading"><h3>Últimos mensajes y eventos</h3><button title="Actualizar diagnóstico" aria-label="Actualizar diagnóstico" className="icon-button" onClick={() => { void refreshEvents(); void refreshDiagnostics(); }}><RefreshCw size={15} /></button><button title="Borrar historial local" aria-label="Borrar historial local" className="icon-button" onClick={() => void clearPushEvents().then(refreshEvents).catch(() => setHistoryError('No pudimos borrar el historial local.'))}><Trash2 size={15} /></button></div>
              {historyError && <p role="status">{historyError}</p>}
              {events.map(item => <details className="event-row" key={item.id}><summary><span>{item.type}</span><small>{item.context === 'foreground' ? 'Primer plano' : 'Segundo plano'} · {new Date(item.timestamp).toLocaleTimeString('es')}</small></summary><p>Message ID: {item.messageId || 'No disponible'}</p><p>{item.timestamp}</p><pre>{JSON.stringify(item.payload, null, 2)}</pre></details>)}
              {lastPayload && events.length === 0 && <pre>{JSON.stringify(lastPayload, null, 2)}</pre>}
              <p className="diagnostic-footnote">Historial local de hasta 50 eventos. Abrir una notificación no confirma su lectura. Reenviar reutiliza los datos y el token del registro actual.</p>
            </div>
          </details>}
        </section>

      </main>
      <footer className="push-footer"><span><strong>DANAconnect</strong> · Conectamos experiencias.</span><span>Push Experience <span className="footer-dot">·</span> Demo interactiva</span></footer>
    </div>
  );
}
