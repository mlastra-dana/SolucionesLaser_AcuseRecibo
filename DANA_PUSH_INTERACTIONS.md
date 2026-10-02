# Apertura y Clic

El usuario confirma la recepcion real de fase 1 en Contact Manager, UID 19, con estado, fecha de recepcion y PUSH_MESSAGE_ID correctos. Esa prueba no es simulada y fue anterior al estandar Push Tracking V1; sus campos equivalentes actuales son PUSH_STATUS y PUSH_RECEIVED_AT. Esta ampliacion mantiene el mismo endpoint, autenticacion por referencia, IndexedDB y contrato de recepcion. No modifica Start Conversation, Lambda, variables de entorno, Firebase ni VAPID. No crea tablas ni contactos adicionales.

## Interacciones

- `PUSH_OPENED`: toque real del cuerpo de la notificacion del sistema, apertura explicita desde el banner o desde Mis notificaciones. Mostrar, recibir o restaurar un mensaje no genera aperturas.
- `PUSH_CLICKED`: solo seleccion de Conocer mas, con `accion=CONOCER_MAS`. Abrir el historial o tocar el cuerpo de la notificacion no genera clics.
- El CTA aparece en el mensaje abierto y muestra una seccion informativa de la misma PWA. Tambien se incluye en notificaciones creadas por nuestro worker cuando Notification.maxActions permite botones; la alternativa dentro de la PWA no depende de ese soporte. Las notificaciones automaticas de Firebase no se reconstruyen ni se duplican.
- En `notificationclick`, conserva data.push_ref y normaliza fcmMessageId a messageId para los payloads internos FCM. Una accion CONOCER_MAS directa registra apertura y clic; una pulsacion del cuerpo registra solo apertura. [Distincion de action en notificationclick](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event).
- `event.waitUntil` mantiene el guardado/reporte activo incluso sin React. Navegacion y reporte corren independientemente: un fallo de red no bloquea foco o apertura. Se reutiliza una ventana del origen destino cuando existe; el CTA lleva a `/#conocer-mas`.

## Persistencia y Contrato

Se mantienen version 1 y los stores existentes de dana-push-receipts: associations y receipts. Los registros antiguos, sin eventType ni accion, se interpretan como PUSH_RECEIVED y accion vacia. Las claves de fase 1 siguen deduplicando sin migracion destructiva.

Las claves nuevas son JSON de `[pushRef, messageId, eventType, accion]`. Cada evento conserva el primer timestamp UTC de su interaccion real. Reabrir o pulsar varias veces el mismo CTA no repite reportes; tipos distintos no se deduplican entre si. El historial visual sigue separado de la cola persistente.

Los tres eventos envian exactamente las mismas siete claves: action=event, push_ref, eventAuthToken, event, messageId, timestamp, accion. Apertura usa accion vacia; clic usa CONOCER_MAS. Nunca se envian campos de registro ni fechas anteriores vacias. El backend conserva su CSV dinamico por evento, por lo que estos POST no piden borrar PUSH_RECEIVED_AT ni PUSH_OPENED_AT.

Push Tracking V1: solo Lambda transforma event, timestamp y accion a PUSH_STATUS, PUSH_RECEIVED_AT, PUSH_OPENED_AT, PUSH_CLICKED_AT y PUSH_CLICK_ACTION. PUSH_REF y PUSH_MESSAGE_ID conservan sus nombres en Contact Manager. Estos codigos no sustituyen las propiedades del JSON del frontend ni requieren migrar IndexedDB o sus credenciales.

## Orden y Reintentos

Los envios se serializan por pushRef mediante la transaccion/lease compartidos. Si existen eventos pendientes, se procesa recepcion antes de apertura y apertura antes de clic. Un evento anterior con fallo transitorio conserva su lugar y bloquea los posteriores hasta su aceptacion. El planificador usa el plazo del evento elegible, sin bucles de reintento para los posteriores bloqueados.

Un evento de menor rango detectado despues de haber enviado un estado avanzado se conserva localmente como superseded, sin POST, para no retroceder el estado. Tambien se comprueba este limite al reclamar eventos viejos. Un fallo incierto de red puede haber sido aceptado remotamente, por lo que conserva ese limite; un 4xx terminal no confirmado no se considera avance aceptado. No se inventa una fecha de recepcion o apertura para completar campos ausentes.

HTTP 400/403 siguen siendo terminales. El resto conserva el backoff y la recuperacion al volver online/primer plano. La API confirma aceptacion solo con HTTP 202, success=true y uploadAccepted=true.

**Limite externo:** 202 confirma que Bulk Upload acepto el trabajo, no que lo proceso. Esta cola impide enviar eventos atrasados desde el cliente, pero no puede imponer el orden interno de procesamiento de trabajos UPDALL ya aceptados ni garantizar idempotencia ante una respuesta perdida. La monotonicidad final en Contact Manager requiere comprobar ese comportamiento del backend; no se modifica desde esta tarea.

## Diagnostico y Aceptacion

El panel conserva el resumen e incluye los ultimos 20 eventos con tipo, fecha, estado pendiente/enviando/aceptado/error o no enviado por estado avanzado. Detectado indica guardado local; Enviado indica que comenzo un intento HTTP, no entrega confirmada; Aceptado indica los tres requisitos de la respuesta. Nunca muestra eventAuthToken. No se imprimen credenciales en logs.

Las pruebas locales usan Firebase/HTTP simulados, IndexedDB de prueba y Chromium con IndexedDB real. No reemplazan la prueba real de Chrome e iPhone instalado. Los screenshots/fixtures estan en output/playwright, ignorados por Git; no se publican.

Validacion local del 2026-10-02: `npm run build` correcto y 61 pruebas automatizadas aprobadas. Chromium verifico un registro y tres reportes ordenados, apertura de historial sin clic, CTA CONOCER_MAS, deduplicacion de acciones repetidas, persistencia tras recarga y ausencia de credenciales en pantalla. Capturas de 320, 390 y 1440 px sin desbordamiento horizontal.

Despues de publicar y actualizar online la PWA:

1. Registrar desde la PWA y recibir un Push. Confirmar la recepcion existente y su fecha.
2. Tocar la notificacion del sistema o Abrir mensaje del historial. Confirmar PUSH_OPENED, accion vacia, mismo push_ref/messageId y fecha UTC de esa apertura.
3. Elegir Conocer mas. Confirmar PUSH_CLICKED, accion CONOCER_MAS, misma referencia/ID y fecha UTC del clic.
4. Esperar procesamiento de UPDALL y comprobar en la misma fila PUSH_RECEIVED_AT, PUSH_OPENED_AT, PUSH_CLICKED_AT, PUSH_CLICK_ACTION=CONOCER_MAS, PUSH_STATUS=PUSH_CLICKED y PUSH_MESSAGE_ID.
5. Reabrir y repetir el CTA: no debe haber otro register ni otro reporte para esas claves. Probar app visible, segundo plano y red temporalmente perdida, sin provocar fallos deliberados en produccion.

No se hizo deploy, AWS Lambda Test ni nueva prueba real de Contact Manager desde esta ampliacion.
