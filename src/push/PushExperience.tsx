import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Bell, BellRing, Check, CheckCircle2, Info, LoaderCircle, LockKeyhole, RefreshCw, UserRound, X } from 'lucide-react';
import type { MessagePayload } from 'firebase/messaging';
import { listenForPushMessages, registerPushBrowser } from '../services/pushService';
import { registerPushVisitor, type PushVisitor } from '../services/danaService';
import { clearPushEvents, getMessageDetails, readPushEvents, recordPushEvent, type ObservedNotification, type PushEvent } from './eventStore';
import { getPushCapabilities, pushUnavailableMessage, type PushCapabilities } from '../services/pushCapabilities';
import { usePwa } from './usePwa';
import InstallExperience from './InstallExperience';
import NotificationsHistory from './NotificationsHistory';
import { flushPushReceipts, getReceiptDiagnostics, nextReceiptAttempt, queuePushEvent, type ReceiptDiagnostics } from './receiptTracking';
import { formatEventTime } from './eventTimezone';
import { followNotificationCta } from './followNotificationCta';
import { getTrackingVersion, safePushPayload, trackingFields } from './pushPayload';

const demoMode = import.meta.env.VITE_PUSH_DEMO_MODE !== 'false';
type RegistrationStage = 'Validando información' | 'Conectando con Firebase' | 'Registrando dispositivo' | 'Enviando información a DANAconnect' | 'Preparando notificación' | 'Registro completado';

export default function PushExperience() {
  const pwa = usePwa();
  const [view, setView] = useState<'notifications' | 'register'>('notifications');
  const [capabilities, setCapabilities] = useState<PushCapabilities | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<RegistrationStage | null>(null);
  const [fcmToken, setFcmToken] = useState('');
  const [error, setError] = useState('');
  const [visitor, setVisitor] = useState<PushVisitor | null>(null);
  const [resendConfirmed, setResendConfirmed] = useState(false);
  const [resendError, setResendError] = useState('');
  const [events, setEvents] = useState<PushEvent[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [receiptDiagnostics, setReceiptDiagnostics] = useState<ReceiptDiagnostics | null>(null);
  const [receiptStorageError, setReceiptStorageError] = useState(false);
  const [latest, setLatest] = useState<MessagePayload | null>(null);
  const [latestTimestamp, setLatestTimestamp] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [ctaBusy, setCtaBusy] = useState(false);
  const followingCta = useRef(false);
  const [messageContext, setMessageContext] = useState<'foreground' | 'background'>('foreground');
  const stop = useRef<(() => void) | null>(null);
  const listenerGeneration = useRef(0);
  const mounted = useRef(true);
  const seenMessages = useRef(new Set<string>());
  const nameInput = useRef<HTMLInputElement>(null);
  const successTitle = useRef<HTMLHeadingElement>(null);
  const restoredClick = useRef<string | null>(null);
  const submitting = useRef(false);

  async function refreshEvents() {
    try {
      const stored = await readPushEvents();
      setEvents(stored);
      setHistoryError('');
      const clicked = stored.find(item => item.type === 'PUSH_OPENED' && item.context === 'background') ?? stored.find(item => item.type === 'PUSH_CLICKED' && item.context === 'background');
      if (clicked && restoredClick.current !== clicked.id) {
        restoredClick.current = clicked.id;
        setLatest(clicked.payload as unknown as MessagePayload);
        setLatestTimestamp(clicked.timestamp);
        setMessageContext('background');
        setRevealed(true);
        setView('notifications');
      }
    }
    catch { setHistoryError('El historial local no está disponible en este navegador. La recepción Push puede continuar.'); }
  }

  async function refreshCapabilities() {
    setCapabilities(await getPushCapabilities());
  }

  const refreshReceiptDiagnostics = useCallback(async () => {
    try {
      const status = await getReceiptDiagnostics();
      if (mounted.current) { setReceiptDiagnostics(status); setReceiptStorageError(false); }
    } catch { if (mounted.current) setReceiptStorageError(true); }
  }, []);

  useEffect(() => {
    let cancelled = false, revision = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      void refreshReceiptDiagnostics();
      const current = ++revision;
      clearTimeout(retryTimer);
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      void nextReceiptAttempt().then(at => {
        if (cancelled || current !== revision || at === null) return;
        retryTimer = setTimeout(resume, Math.max(1000, at - Date.now()));
      }).catch(() => {});
    };
    const resume = () => {
      refresh();
      if (navigator.onLine) void flushPushReceipts().catch(() => {}).finally(refresh);
    };
    const pause = () => { ++revision; clearTimeout(retryTimer); };
    const visible = () => { if (document.visibilityState === 'visible') resume(); else pause(); };
    let channel: BroadcastChannel | null = null;
    try { if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel('dana-receipt-status'); }
    catch { /* Visibility and online signals still resume receipts in restricted browser contexts. */ }
    if (channel) channel.onmessage = refresh;
    window.addEventListener('dana-receipt-change', refresh);
    window.addEventListener('online', resume);
    window.addEventListener('offline', pause);
    document.addEventListener('visibilitychange', visible);
    resume();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      channel?.close();
      window.removeEventListener('dana-receipt-change', refresh);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', pause);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refreshReceiptDiagnostics]);

  const receivePayload = useCallback((payload: MessagePayload) => {
    if (!mounted.current) return;
    if (payload.messageId && seenMessages.current.has(payload.messageId)) return;
    if (payload.messageId) {
      seenMessages.current.add(payload.messageId);
      if (seenMessages.current.size > 100) seenMessages.current.delete(seenMessages.current.values().next().value!);
    }
    setLatest(safePushPayload(payload as unknown as Record<string, unknown>) as unknown as MessagePayload);
    setLatestTimestamp(new Date().toISOString());
    setMessageContext('foreground');
    setRevealed(false);
    setView('notifications');
    void refreshEvents();
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshEvents();
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
    const visible = () => { if (document.visibilityState === 'visible') { void refreshEvents(); void refreshCapabilities(); } };
    navigator.serviceWorker?.addEventListener('message', received);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      cancelled = true;
      stop.current?.();
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
      await registerPushVisitor(registered);
      if (!mounted.current) return;
      setStage('Preparando notificación');
      setVisitor(registered);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos preparar tu navegador. Revisa tu conexión y vuelve a intentarlo.');
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function resend() {
    if (!visitor || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setResendError('');
    setResendConfirmed(false);
    try {
      if (!pwa.online) throw new Error('Conéctate a Internet para reenviar la notificación.');
      if ('Notification' in window && Notification.permission !== 'granted') {
        throw new Error('Habilita las notificaciones en los ajustes del sitio antes de reenviar.');
      }
      await registerPushVisitor(visitor);
      if (!mounted.current) return;
      setResendConfirmed(true);
    } catch (cause) {
      if (mounted.current) setResendError(cause instanceof Error ? cause.message : 'No pudimos solicitar el reenvío. Revisa tu conexión.');
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function openMessage() {
    if (!latest) return;
    setRevealed(true);
    await observeInteraction('PUSH_OPENED', latest as unknown as Record<string, unknown>);
  }

  async function openHistoryMessage(message: ObservedNotification) {
    setView('notifications');
    setLatest(message.payload as unknown as MessagePayload);
    setLatestTimestamp(message.timestamp);
    setMessageContext(message.context);
    setRevealed(true);
    await observeInteraction('PUSH_OPENED', message.payload);
  }

  async function observeInteraction(type: 'PUSH_OPENED' | 'PUSH_CLICKED', payload: Record<string, unknown>, accion = '') {
    const timestamp = new Date().toISOString();
    let failed = false;
    await queuePushEvent(type, payload, timestamp, accion).catch(() => { failed = true; });
    await recordPushEvent(type, 'foreground', payload, timestamp, accion).catch(() => { failed = true; });
    await refreshEvents();
    if (failed) setHistoryError('La interacción continúa, pero no pudimos guardar todo su seguimiento local.');
    void flushPushReceipts().catch(() => {});
  }

  async function followCta() {
    if (!latest || !revealed || followingCta.current) return;
    followingCta.current = true;
    setCtaBusy(true);
    try {
      const result = await followNotificationCta(latest as unknown as Record<string, unknown>);
      await refreshEvents();
      if (result && !result.stored) setHistoryError('La interacción continúa, pero no pudimos guardar todo su seguimiento local.');
      else if (result && !result.navigated) setHistoryError('No pudimos abrir el destino de la notificación.');
    } finally {
      followingCta.current = false;
      if (mounted.current) setCtaBusy(false);
    }
  }

  function clearHistory() {
    void clearPushEvents().then(() => {
      setLatest(null);
      return refreshEvents();
    }).catch(() => setHistoryError('No pudimos borrar el historial local.'));
  }

  const latestDetails = latest ? getMessageDetails(latest as unknown as Record<string, unknown>) : null;
  const diagnosticPayload = latest as unknown as Record<string, unknown> | null ?? events[0]?.payload;
  const diagnosticFields = diagnosticPayload ? trackingFields(diagnosticPayload) : null;

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
            <h1 id="experience-title">DANA Push Experience</h1>
          </div>

          <InstallExperience pwa={pwa} />
          {capabilities && !capabilities.supported && <p className="push-compatibility-note" role="status"><Info size={16} />{pushUnavailableMessage(capabilities.reason)}</p>}
          </div>

          <nav className="push-navigation" aria-label="Navegación principal">
            <button className="secondary-button" aria-current={view === 'notifications' ? 'page' : undefined} onClick={() => setView('notifications')}><Bell size={17} />Mis notificaciones</button>
            <button className="secondary-button" aria-current={view === 'register' ? 'page' : undefined} onClick={() => setView('register')}><UserRound size={17} />Registrar dispositivo</button>
          </nav>

          {view === 'register' && <div className="registration-panel">
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
          </div>}

          {view === 'notifications' && latest && latestDetails && <aside className="message-banner" aria-live="polite"><BellRing size={23} /><div><small>{messageContext === 'foreground' ? 'MENSAJE OBSERVADO · PRIMER PLANO' : 'MENSAJE OBSERVADO · SEGUNDO PLANO'}</small><h3>Tu notificación</h3><h4>{latestDetails.title}</h4><p>{latestDetails.body || 'Sin cuerpo de mensaje'}</p>{revealed && <>{latestDetails.cta && <button className="secondary-button notification-cta" disabled={ctaBusy} onClick={() => void followCta()}>{latestDetails.cta.label} <ArrowUpRight size={15} /></button>}{latestDetails.image && <img key={latestDetails.image} className="message-image" src={latestDetails.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}<time dateTime={latestTimestamp}>{formatEventTime(latestTimestamp, receiptDiagnostics?.timezone)}</time></>}</div>{!revealed && <button title="Abrir mensaje" aria-label="Abrir mensaje" className="icon-button" onClick={() => void openMessage()}><ArrowRight size={18} /></button>}<button title="Cerrar mensaje" aria-label="Cerrar mensaje" className="icon-button" onClick={() => setLatest(null)}><X size={18} /></button></aside>}

          {historyError && <p className="history-error" role="status">{historyError}</p>}
          {view === 'notifications' && <NotificationsHistory events={events} onOpen={message => void openHistoryMessage(message)} onRefresh={() => void refreshEvents()} onClear={clearHistory} />}

          {demoMode && <details className="receipt-diagnostics">
            <summary>Información de diagnóstico</summary>
            <dl>
              <dt>V2 detectada</dt><dd>{diagnosticPayload && getTrackingVersion(diagnosticPayload) === 'v2' ? 'Sí' : 'No'}</dd>
              <dt>Endpoint V2</dt><dd>{receiptDiagnostics?.v2EndpointConfigured ? 'Configurado' : 'Ausente o inválido'}</dd>
              <dt>PUSH_REF detectado</dt><dd>{diagnosticFields?.pushRef ? 'Sí' : 'No'}</dd>
              <dt>EVENT_AUTH_TOKEN detectado</dt><dd>{diagnosticPayload?.danaCredentialDetected === true ? 'Sí' : 'No'}</dd>
              <dt>PushRef asociado</dt><dd>{receiptDiagnostics?.associated ? 'Sí' : 'No'}</dd>
              <dt>Último evento</dt><dd>{receiptDiagnostics?.lastEvent ?? '—'}</dd>
              <dt>Envío a Lambda</dt><dd>{receiptStorageError ? 'error' : receiptDiagnostics?.status === 'accepted' ? 'aceptado' : receiptDiagnostics?.status === 'sending' ? 'enviando' : receiptDiagnostics?.status === 'superseded' ? 'no enviado: estado avanzado' : receiptDiagnostics?.status === 'error' ? 'error' : receiptDiagnostics?.status === 'pending' ? 'pendiente' : '—'}</dd>
              <dt>Cantidad de eventos pendientes</dt><dd>{receiptDiagnostics?.pending ?? 0}</dd>
              <dt>Zona horaria del dispositivo</dt><dd>{receiptDiagnostics?.timezone ?? '—'}</dd>
            </dl>
            {receiptDiagnostics?.timezoneWarning && <p role="status">{receiptDiagnostics.timezoneWarning === 'stored' ? 'No se pudo detectar la zona horaria; se usa la última zona válida guardada.' : 'No se pudo detectar la zona horaria; se usa UTC.'}</p>}
            {!!receiptDiagnostics?.events.length && <ul className="tracking-events">
              {receiptDiagnostics.events.map(item => <li key={item.id}>
                <strong>{item.eventType}</strong><span>{item.status === 'accepted' ? 'Aceptado' : item.status === 'sending' ? 'Enviando' : item.status === 'superseded' ? 'No enviado: estado avanzado' : item.status === 'error' ? 'Error' : 'Pendiente'}</span>
                {item.accion && <small>Acción: {item.accion}</small>}
                <small>Tracking: {item.version.toUpperCase()}</small>
                <small>HTTP: {item.httpStatus ?? 'Sin respuesta'}</small>
                {item.issue && <small role="status">{item.issue}</small>}
                <small>Detectado: Sí · Enviado: {item.sent ? 'Sí' : 'No'} · Aceptado: {item.accepted ? 'Sí' : 'No'}</small>
                <time dateTime={item.timestamp}>{formatEventTime(item.timestamp, item.timezone)} · {item.timezone}</time>
                {item.timezoneWarning && <small>{item.timezoneWarning === 'stored' ? 'Zona horaria recuperada del dispositivo.' : item.timezoneWarning === 'legacy' ? 'Evento anterior sin zona horaria: se conserva UTC.' : 'Zona horaria no disponible al detectar el evento: se conserva UTC.'}</small>}
              </li>)}
            </ul>}
          </details>}

        </section>

      </main>
      <footer className="push-footer"><span><strong>DANAconnect</strong> · Conectamos experiencias.</span><span>Push Experience <span className="footer-dot">·</span> Demo interactiva</span></footer>
    </div>
  );
}
