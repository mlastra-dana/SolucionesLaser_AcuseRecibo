# Apertura y Clic

El usuario confirma la recepcion real de fase 1 en Contact Manager, UID 19, con estado, fecha de recepcion y PUSH_MESSAGE_ID correctos. Esa prueba no es simulada y fue anterior al estandar Push Tracking V1; sus campos equivalentes actuales son PUSH_STATUS y PUSH_RECEIVED_AT. Esta ampliacion mantiene el mismo endpoint, autenticacion por referencia, IndexedDB y contrato de recepcion. No modifica Start Conversation, Lambda, variables de entorno, Firebase ni VAPID. No crea tablas ni contactos adicionales.

## Interacciones

- `PUSH_OPENED`: toque real del cuerpo de la notificacion del sistema, apertura explicita desde el banner o desde Mis notificaciones. Mostrar, recibir o restaurar un mensaje no genera aperturas.
- `PUSH_CLICKED`: solo seleccion de un CTA completo y valido del payload, con `accion=data.cta_action`. Abrir el historial o tocar el cuerpo de la notificacion no genera clics.
- El CTA aparece en el mensaje abierto con `data.cta_label` y abre `data.cta_url` HTTPS. Sin los tres parametros validos no hay boton ni accion inventada. Tambien se incluye en notificaciones creadas por nuestro worker cuando Notification.maxActions permite botones; la alternativa dentro de la PWA no depende de ese soporte. Las notificaciones automaticas de Firebase no se reconstruyen ni se duplican.
- En `notificationclick`, conserva data.push_ref y normaliza fcmMessageId a messageId para los payloads internos FCM. Una accion que coincide con el CTA valido registra solo clic; una pulsacion del cuerpo registra solo apertura y abre el detalle correspondiente en la PWA. [Distincion de action en notificationclick](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event). Ver [CTA nativo y limitaciones del emisor](DANA_PUSH_NATIVE_CTA.md).
- `event.waitUntil` mantiene el guardado/reporte activo incluso sin React. El CTA espera el guardado local, pero nunca la respuesta HTTP para navegar. Se reutiliza una ventana del origen destino cuando existe; el CTA lleva al destino HTTPS del payload. En React se reserva una ventana durante la activacion del usuario, se elimina opener y se navega tras guardar. Si el navegador bloquea esa ventana, se usa la pestaña actual despues del guardado.

## Persistencia y Contrato

Se mantienen version 1 y los stores existentes de dana-push-receipts: associations y receipts. Los registros antiguos, sin eventType ni accion, se interpretan como PUSH_RECEIVED y accion vacia. Las claves de fase 1 siguen deduplicando sin migracion destructiva.

Las claves nuevas son JSON de `[pushRef, messageId, eventType, accion]`. Cada evento conserva el primer timestamp UTC de su interaccion real. Reabrir o pulsar varias veces el mismo CTA no repite reportes; tipos distintos no se deduplican entre si. El historial visual sigue separado de la cola persistente.

Los tres eventos envian exactamente las mismas ocho claves: action=event, push_ref, eventAuthToken, event, messageId, timestamp, timezone, accion. Apertura usa accion vacia; clic usa el identificador dinamico del CTA. Nunca se envian campos de registro ni fechas anteriores vacias. El backend conserva su CSV dinamico por evento, por lo que estos POST no piden borrar PUSH_RECEIVED_AT ni PUSH_OPENED_AT.

Push Tracking V1: solo Lambda transforma event, timestamp y accion a PUSH_STATUS, PUSH_RECEIVED_AT, PUSH_OPENED_AT, PUSH_CLICKED_AT y PUSH_CLICK_ACTION. PUSH_REF y PUSH_MESSAGE_ID conservan sus nombres en Contact Manager. Estos codigos no sustituyen las propiedades del JSON del frontend ni requieren migrar IndexedDB o sus credenciales.

## Zona Horaria del Dispositivo

El servicio compartido por React y Worker captura `Intl.DateTimeFormat().resolvedOptions().timeZone` al generar cada evento y valida su identificador mediante Intl. Guarda timezone junto al timestamp UTC original en receipts; reintentos y duplicados no reemplazan ninguno de los dos. Solo Lambda convierte el instante a hora local para Contact Manager.

La metadata no sensible lastValidTimezone se conserva en IndexedDB dana-push-timezone, store settings, version 1. Se actualiza durante el uso de la PWA y al capturar eventos. Si la deteccion falla en el Worker, recupera esa ultima zona valida; si no existe, guarda UTC con advertencia diagnostica. No depende de window, document, idioma o region AWS. Las bases dana-push-receipts y dana-push-events mantienen su version, stores, asociaciones y registros.

Eventos anteriores sin timezone conservan el instante UTC y se envian con UTC explicito; no se inventa una zona historica usando la configuracion actual. La advertencia por evento distingue esta compatibilidad del fallback de eventos nuevos. El diagnostico muestra la zona actual y las horas de cada evento con su zona capturada en formato YYYY-MM-DD hh:mm:ss AM/PM. El historial visual usa la zona actual del dispositivo. Ninguna representacion visual cambia el timestamp persistido.

Validacion horaria local del 2026-10-02: build correcto y 69 pruebas aprobadas, incluidos los tres contratos, persistencia/reintentos, deduplicacion, metadata no disponible, recuperacion desde Worker sin window/document/Intl, eventos antiguos, UTC explicito y AM/PM con horario de verano. Chromium con America/Caracas mostro 2026-10-02 04:02:15 PM para 2026-10-02T20:02:15.000Z en 320, 390 y 1440 px sin desbordamiento ni credenciales visibles. Solo se usaron fixtures locales; no se invoco Lambda ni se verifico Contact Manager en esta prueba.

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
3. Elegir el CTA del mensaje. Confirmar PUSH_CLICKED, accion igual a data.cta_action, misma referencia/ID, fecha UTC y zona del clic; el destino debe ser data.cta_url.
4. Esperar procesamiento de UPDALL y comprobar en la misma fila PUSH_RECEIVED_AT, PUSH_OPENED_AT, PUSH_CLICKED_AT, PUSH_CLICK_ACTION igual a data.cta_action, PUSH_STATUS=PUSH_CLICKED y PUSH_MESSAGE_ID.
5. Reabrir y repetir el CTA: no debe haber otro register ni otro reporte para esas claves. Probar app visible, segundo plano y red temporalmente perdida, sin provocar fallos deliberados en produccion.

No se hizo deploy, AWS Lambda Test ni nueva prueba real de Contact Manager desde esta ampliacion.

## Cierre V1: CTA Dinamico

`normalizeNotification` valida conjuntamente cta_label, cta_action y cta_url. El texto se presenta mediante React, nunca como HTML. Solo admite URLs HTTPS absolutas, sin usuario/clave, parametros sensibles ni la referencia del mensaje en el destino. No agrega tokens o referencias a la navegacion. La normalizacion no modifica el payload completo conservado en el historial.

`followNotificationCta` reserva la ventana durante el clic real y elimina opener. Conserva primero el clic en la cola IndexedDB y el historial, inicia el reporte y abre el destino sin esperar HTTP. Si la ventana esta bloqueada usa la pestaña actual; si falla el almacenamiento se advierte sin bloquear la navegacion. La cola conserva credenciales por referencia, timestamp UTC, timezone y accion dinamica. Deduplicacion y reintentos existentes siguen intactos, incluso para eventos historicos pendientes sin parametros CTA en su payload original. No se cambian versiones o stores ni se borra informacion.

El Worker sustituye solamente el boton/accion fijos por el CTA valido del payload. El clic del cuerpo conserva PUSH_OPENED; el boton nativo opcional registra solamente PUSH_CLICKED con la accion del payload. El CTA dentro de la PWA no requiere soporte de botones nativos. Recepcion, Firebase automatico, iconos, imagenes y configuracion de instalacion se mantienen.

Validacion del cierre: `npm run build` correcto y 75 pruebas aprobadas. Chromium con IndexedDB real y HTTP simulado verifico etiquetas/destinos CONOCER_MAS y CONSULTAR_POLIZA, apertura sin clic, falta de CTA y URL insegura sin boton, navegacion sin opener, fallo 503, persistencia tras recarga, deduplicacion y reintento a los 30 segundos con timestamp/timezone originales. Vistas 320, 390 y 1440 px sin desbordamiento. El build local carece de URL Lambda; la URL ficticia se sustituyo solo en la respuesta JS del navegador aislado, sin modificar archivos de configuracion, variables de entorno o el build publicado. No se registro ningun contacto real ni se invoco Lambda.

Pendiente de aceptacion real despues del despliegue: probar Chrome y la PWA instalada en iPhone con Push Parameters completos; comprobar en la misma fila PUSH_STATUS=PUSH_CLICKED, PUSH_CLICK_ACTION igual a cta_action y PUSH_CLICKED_AT local AM/PM, preservando PUSH_RECEIVED_AT, PUSH_OPENED_AT y PUSH_MESSAGE_ID. HTTP 202 confirma aceptacion del trabajo, no su procesamiento final.
