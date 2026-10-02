import { ArrowUpRight, Bell, Check, RefreshCw, Trash2 } from 'lucide-react';
import { getNotificationHistory, type ObservedNotification, type PushEvent } from './eventStore';

type Props = { events: PushEvent[]; onOpen(message: ObservedNotification): void; onRefresh(): void; onClear(): void };

export default function NotificationsHistory({ events, onOpen, onRefresh, onClear }: Props) {
  const messages = getNotificationHistory(events);
  return <section className="notifications-history" aria-labelledby="notifications-title">
    <div className="history-heading"><Bell size={17} /><h2 id="notifications-title">Mis notificaciones</h2>
      <button className="icon-button" title="Actualizar notificaciones" aria-label="Actualizar notificaciones" onClick={onRefresh}><RefreshCw size={16} /></button>
      <button className="icon-button" title="Borrar historial local" aria-label="Borrar historial local de notificaciones" onClick={onClear}><Trash2 size={16} /></button>
    </div>
    {!messages.length ? <p className="empty-history">Todavía no hay notificaciones observadas en este dispositivo.</p> : <ul>
      {messages.map(message => <li key={message.id}>
        <div className="notification-item-heading"><h3>{message.title}</h3><span className="notification-open-state">{message.opened ? <><Check size={13} /> Abierta</> : message.received ? 'Recibida' : 'Interacción registrada'}</span></div>
        <p>{message.body || 'Sin cuerpo de mensaje'}</p>
        <div className="notification-item-meta"><time dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleString('es')}</time><button className="text-button" onClick={() => onOpen(message)}>Abrir mensaje <ArrowUpRight size={15} /></button></div>
        {message.messageId && <small className="message-identifier">Firebase ID: {message.messageId}</small>}
      </li>)}
    </ul>}
  </section>;
}
