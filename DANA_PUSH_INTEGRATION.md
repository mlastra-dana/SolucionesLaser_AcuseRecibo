# Registro Automatico y Notificaciones DANA

Cambios locales en `dana-push-experience`. No se han modificado AWS, DANAconnect, variables publicadas, manifest, iconos, VAPID ni IDs Firebase. No se hizo deploy. El usuario confirma que la version anterior recibe Push en Chrome y PWA iPhone; esta nueva version requiere prueba real posterior a la publicacion.

## Dos Ajustes

`src/push/normalizeNotification.ts` interpreta el primer texto no vacio en este orden:

- Titulo: `notification.title`, `data.Titulo`, `data.titulo`, `data.title`, fallback `DANA Push Experience`.
- Cuerpo: `notification.body`, `data.Mensaje`, `data.mensaje`, `data.body`.
- Imagen: `data.IMAGEN`, `data.imagen`, `notification.image`; se conserva `data.image` como compatibilidad. Solo URLs HTTPS validas, sin credenciales incrustadas.

La misma funcion sirve al banner foreground, detalle, diagnostico, representacion de mensajes antiguos en IndexedDB y notificaciones data-only del worker. No modifica payloads ni message IDs y conserva los tres tipos de eventos. Las imagenes remotas son opcionales y el fallo de carga no oculta el mensaje.

**Demo en primer plano:** cada recepcion real `onMessage` solicita al mismo worker mostrar tambien una notificacion del sistema mediante `showNotification`, aunque la app este visible. El banner y el historial se conservan. El worker centraliza los pedidos de todas las pestañas, usa el message ID como tag y evita repetir IDs recientes o notificaciones con ese tag ya visibles. Un clic no vuelve a mostrar el mensaje ni genera otra recepcion. Sin message ID no se garantiza deduplicacion. El sistema operativo sigue controlando banners, sonidos, permisos y modo concentracion. [API de notificaciones del worker](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification).

**Notificacion del sistema:** Firebase muestra automaticamente payloads que incluyen `notification`, antes del callback background. No se cierran ni se vuelven a mostrar, evitando duplicados. La correccion de `data.Titulo` se aplica dentro de la PWA y a data-only. Si se necesita tambien ese titulo en la notificacion automatica del sistema, el envio DANA/FCM debe incluir `notification.title`; no se cambia el emisor desde esta tarea. [Recepcion oficial de Firebase](https://firebase.google.com/docs/cloud-messaging/web/receive-messages).

`src/services/danaService.ts` ahora realiza el POST real a `import.meta.env.VITE_DANA_PUSH_API_URL` despues de obtener el token. El formulario solicita nombre completo, email, telefono con codigo de pais y consentimiento. Telefono: 7-15 digitos con + inicial opcional, sin espacios, parentesis ni guiones.

## Contrato Exacto

```json
{
  "NOMBRE": "Nombre de prueba",
  "EMAIL": "demo@example.com",
  "TELEFONO": "584120000000",
  "TOKEN": "token real generado por Firebase"
}
```

Solo esas cuatro claves, sin `fields`, `data`, `source`, apellido ni claves minusculas. Campos recortados. `Content-Type: application/json`, credenciales omitidas, sin cache ni redirecciones. No se agregan secretos al navegador ni se llama a Firebase Admin.

El frontend exige HTTP exitoso, `success === true` y `conversationStarted === true`. `resultId` se trata como dinamico; no determina el exito. Se lee el JSON directo de Function URL. Solo si aparecen explicitamente `statusCode` y `body` se interpreta el sobre de invocacion. No se confunde el cuerpo HTTP con ese sobre. [Formato oficial Function URL](https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html).

## Estados y Errores

Se conserva el boton Registrarme y recibir mi Push y se informa la fase activa: validacion, conexion Firebase, registro de dispositivo, envio DANA. Tras confirmacion aparece la preparacion de la notificacion en el texto de exito y Registro completado. Las etapas instantaneas no se alargan artificialmente. No se afirma entrega ni lectura.

La pantalla de exito solo aparece tras las tres condiciones de Lambda. Mensaje: "Tu registro se procesó correctamente. DANAconnect está preparando tu primera notificación Push."

- Navegador incompatible/permisos rechazados/token Firebase fallido mantienen errores propios.
- URL ausente/no HTTPS, Lambda no disponible, error HTTP/JSON y conversacion no confirmada tienen mensajes separados.
- AbortController limita la solicitud a 30 segundos, incluida lectura de respuesta.
- Nunca se repite automaticamente un POST. En red/timeout/respuesta incierta se advierte que el registro podria haberse procesado y que reintentar puede duplicar una conversacion.
- El boton y formulario se bloquean durante la solicitud; una guarda sincrona evita dos envios en el mismo ciclo de eventos.
- Ante fallo Lambda se mantiene token y listener foreground en memoria. El reintento manual reutiliza ese token, sin volver a pedir permiso ni generar otro. Copiar token sigue disponible en diagnostico aunque haya fallado Lambda.
- Reiniciar borra datos y token del estado React, no revoca permisos ni suscripcion. Recargar tambien pierde el token guardado por la interfaz; Firebase gestiona su propia suscripcion.
- No se imprimen tokens, datos personales ni respuestas crudas en logs. El historial local no recibe los datos del formulario. La Lambda si recibe los cuatro campos porque ese es su contrato.

## Configuracion y Primera Prueba

1. El responsable debe configurar `VITE_DANA_PUSH_API_URL` con la Function URL HTTPS existente en las variables de build de **esta rama** de Amplify. Para desarrollo, usar `.env.push.local` ignorado. No se ha inventado una URL ni modificado ningun archivo de entorno real.
2. Conservar todas las variables Firebase/VAPID que ya funcionan. Revisar manualmente CORS de Function URL: origen `https://dana-push-experience.d1al7cfbz0rrq3.amplifyapp.com`, metodo POST y cabecera Content-Type; OPTIONS debe responder al preflight. Para localhost, permitir su origen solo cuando corresponda. No usar `no-cors` ni secretos frontend. CORS no es proteccion contra abuso. [CORS de Function URL](https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html).
3. Ejecutar `npm install`, `npm run build`, publicar `dist` con la especificacion actual de `dana-push-experience`. No tocar otras ramas ni backend.
4. Abrir/recargar online la PWA ya instalada para actualizar su worker. Se conservan URL `/firebase-messaging-sw.js`, scope `/`, `updateViaCache: none`, Workbox revisionado, skipWaiting/claim y recarga ante cambio de controlador. No cachea el POST Lambda ni endpoints Firebase.
5. En Chrome, introducir datos de prueba validos (telefono sin separadores), consentir y permitir. Comprobar un solo POST con exactamente las cuatro claves y respuesta confirmada. No hace falta ejecutar Lambda Test ni copiar tokens.
6. Esperar el Push DANA con la app visible; comprobar la notificacion del sistema con titulo DANA PUSH y el mismo mensaje en historial. Pulsar el Push y comprobar foco/apertura e ID, sin otra notificacion ni otro PUSH_RECEIVED. Repetir con dos pestañas abiertas y despues en segundo plano. No se llama lectura a una apertura.
7. Repetir desde el icono instalado de iPhone. Probar app visible y segundo plano; una notificacion del sistema por mensaje. No se modificaron metadatos de instalacion ni Firebase para esa plataforma.
8. Si la solicitud pierde su respuesta, comprobar primero si llego el Push/si la conversacion existe antes de reintentar manualmente. No hacer pruebas destructivas de fallo contra produccion sin coordinarlo.

La URL publica no autentica clientes. Los futuros controles contra abuso pertenecen a la API; nunca agregar DANA_USERNAME, DANA_PASSWORD, DANA_PROJECT_ID ni serviceAccount.json a variables VITE.

## Archivos y Validacion

Creado: `src/push/normalizeNotification.ts`, esta guia.

Modificados: `src/services/danaService.ts`, `src/services/pushService.ts`, `src/push/PushExperience.tsx`, `src/push/NotificationsHistory.tsx`, `src/push/eventStore.ts`, `src/push/firebase-messaging-sw.js`, `src/push/push.css`, `.env.example`, `tests/push-services.test.mjs`, `tests/pwa-assets.test.mjs`, `DANA_PUSH_EXPERIENCE.md`, `DANA_PUSH_PWA.md`.

`npm install` completo sin cambios de versiones; conserva 16 alertas audit preexistentes (2 bajas, 5 moderadas, 9 altas), sin audit fix. `npm run build` correcto. 33 pruebas automatizadas comprueban claves exactas, respuestas directas/anidadas, errores, timeout sin reintentos, permisos ya concedidos, normalizacion y ausencia de notificaciones duplicadas.

La prueba de integracion en navegador utiliza un doble Firebase explicito y respuestas HTTP simuladas, sin llamar a AWS ni enviar un Push real. Los artefactos de prueba estan en `output/playwright/`, ignorados por Git, y no forman parte del build publicado. Esto no sustituye el recorrido real tras configurar la URL y desplegar.

Resultado de esa prueba: doble submit genero un solo POST; HTTP 503 y conversacion no confirmada mantuvieron el formulario sin exito. Tras dos reintentos manuales hubo tres POST y una sola generacion de token. La respuesta confirmada mostro el texto correcto. DANA PUSH se recupero en banner, historial y diagnostico; apertura e imagen funcionaron con fixture explicito. Reiniciar vacio los tres campos y retiro el token. Capturas a 320, 390 y 1440 px sin desbordamiento horizontal.

Actualizacion foreground: build correcto y 36 pruebas aprobadas, incluida deduplicacion entre pestañas, clic sin segunda visualizacion y fallo de display sin perder la recepcion. Chromium con el worker real creo una notificacion local explicita con titulo/cuerpo/icono/ID correctos; un segundo pedido desde otra pestaña mantuvo una sola notificacion. Se cerro al terminar. No fue un envio DANA ni una prueba iPhone. Repetir con la app visible en iPhone tras publicar y actualizar online la PWA; los ajustes del sistema pueden silenciar el banner.
