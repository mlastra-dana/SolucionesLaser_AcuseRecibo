# Fase 1: Recepcion Real

Guia historica de fase 1. El usuario confirma su aceptacion real en Contact Manager, UID 19. La ampliacion actual de apertura/clic se documenta en [DANA_PUSH_INTERACTIONS.md](DANA_PUSH_INTERACTIONS.md); mantiene los stores, credenciales, claves antiguas y contrato de recepcion de esta fase.

Solo se reporta `PUSH_RECEIVED` para referencias registradas desde esta PWA. No se modifica Lambda, Contact Manager, Firebase, VAPID ni el envio DANA. Los eventos de clic y apertura preexistentes siguen siendo locales; no se reportan a la API.

## Asociacion y Cola

`registerPushVisitor` conserva `pushRef`, `eventAuthToken` y `resultId` de la respuesta exitosa en IndexedDB `dana-push-receipts`, store `associations`. Una referencia existente nunca se reemplaza con otro token; registros o reenvios con otra referencia agregan otra asociacion. Los tokens no se muestran ni se imprimen. No son credenciales privadas de Firebase Admin/DANA; son autorizaciones de evento por referencia recibidas del backend y se almacenan solo en el navegador.

El store `receipts` conserva las recepciones, independiente del historial visual de 50 eventos. Borrar Mis notificaciones no borra la cola ni sus asociaciones. Los recibos aceptados se conservan para deduplicacion. Borrar los datos del sitio elimina ambos almacenes y sus credenciales.

- Captura al entrar en `onMessage` / `onBackgroundMessage`, con timestamp ISO UTC del callback, `data.push_ref` y messageId real. No inventa IDs ni credenciales si faltan.
- Guarda antes de reportar, incluso si todavia no llego la respuesta de register. Nunca envia un evento sin asociacion coincidente.
- Clave local: JSON de `[pushRef, messageId, PUSH_RECEIVED]`. Conserva la primera fecha, incluso ante callbacks repetidos.
- Transaccion readwrite para reclamar cada envio con lease de 45 segundos, compartida por React, otras pestañas y Worker. El POST tiene timeout de 15 segundos. La expiracion permite recuperar trabajo si el contexto desaparece.
- El Worker espera el reporte despues de la visualizacion existente. Firebase conserva sus notificaciones automaticas; los mensajes data-only conservan su visualizacion actual. Ver [recepcion Firebase](https://firebase.google.com/docs/cloud-messaging/web/receive-messages).

## Contrato de Evento

POST a la misma `VITE_DANA_PUSH_API_URL`, con `action`, `push_ref`, `eventAuthToken`, `event`, `messageId`, `timestamp`, `accion` y, en la version actual, `timezone` IANA capturada con el evento. `action=event`, `event=PUSH_RECEIVED`, `accion=""`. timestamp sigue siendo UTC; solo Lambda convierte a hora local. Sin NOMBRE, EMAIL, TELEFONO ni TOKEN FCM en este POST: no invoca otro register ni crea otro contacto.

El Worker importa el mismo modulo de tracking; `vite.config.ts` ya sustituye `import.meta.env` durante el bundle esbuild. No intenta acceder a variables Vite en runtime. La URL HTTPS es publica; el token de evento llega solo desde la respuesta de register, nunca se incorpora al build. No se cachean POSTs.

Se marca aceptado solo con HTTP 202 y ambos booleanos `success: true`, `uploadAccepted: true`. Eso confirma aceptacion de Contact Bulk Upload, no procesamiento terminado ni lectura del mensaje.

Errores de red, timeout, JSON inesperado o respuesta no confirmada conservan el recibo. Backoff desde 30 segundos hasta 15 minutos. La PWA reanuda al abrir, volver a primer plano o recuperar conexion; mientras esta visible y online programa el siguiente intento elegible. El Worker hace una pasada en la recepcion, sin depender de Background Sync (no universal en iPhone). HTTP 400/403 y otros 4xx salvo 408/429 son terminales y no se reintentan automaticamente. Permanecen como error, sin contarse como pendientes de envio automatico.

La deduplicacion es local: una respuesta perdida o un contexto terminado despues de que el backend acepto puede ocasionar un reenvio de la misma clave. No se puede garantizar exactamente una llamada remota sin idempotencia del backend. No se modifica ese backend en esta fase.

El diagnostico minimo contiene solo asociacion Si/No, ultimo evento, estado pendiente/aceptado/error y pendientes. Sin IDs Firebase, token, respuestas crudas ni datos del contacto.

Si una respuesta antigua de register no contiene ambos campos de tracking, se conserva el registro visual, pero no se inventa la asociacion: los recibos esperan y el diagnostico indica No si no hay ninguna asociacion guardada. Si falla el guardado tras register, se advierte que el registro ya fue aceptado y que no debe repetirse para evitar otro contacto.

## Aceptacion Real Pendiente

Validacion local del 2026-10-02: `npm run build` correcto y 50 pruebas de `npm run test:push` aprobadas. Incluyen captura foreground/background, carrera con register, referencias independientes, persistencia, deduplicacion entre contextos, 400/403 terminales, red/timeout, recuperacion de lease y ausencia de credenciales en el diagnostico. Chromium con IndexedDB real comprobo un register y un reporte, recarga y dos pestañas sin duplicados; vistas de 320, 390 y 1440 px sin desbordamiento.

Las pruebas locales utilizan IndexedDB de prueba y Chromium con IndexedDB real, Firebase simulado y HTTP simulado. No se ejecuta Lambda Test, no se cambia el backend ni se crea un contacto real desde estas pruebas. El despliegue y la comprobacion de Contact Manager no se han realizado desde esta tarea.

Despues de publicar esta rama:

1. Abrir online la PWA para actualizar el Worker. Registrar un contacto nuevo con consentimiento.
2. Verificar que la respuesta de register contiene `pushRef`, `eventAuthToken` y `resultId` sin copiar el token a capturas o logs.
3. Recibir el Push real. Diagnostico: asociacion Si, ultimo evento PUSH_RECEIVED, envio aceptado y pendientes 0.
4. Comprobar que el POST de evento usa la referencia e ID del mensaje y fecha de recepcion originales. No ejecutar Lambda Test ni otro registro para reportar.
5. Esperar el procesamiento de UPDALL y verificar en la misma fila `PUSH_STATUS=PUSH_RECEIVED`, `PUSH_RECEIVED_AT` y `PUSH_MESSAGE_ID` correspondientes (nomenclatura actual Push Tracking V1, mapeada exclusivamente por Lambda). El estado aceptado por si solo no prueba este paso.
6. Repetir una prueba coordinada en segundo plano, Chrome e iPhone instalado. Probar retorno de conexion sin perder la fecha original. No provocar 400/403 en produccion para probar fallos.
