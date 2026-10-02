# DANA Push Experience: PWA

Implementacion local en `dana-push-experience`. No se han modificado Amplify, DANAconnect, Firebase, la VAPID ni las variables publicadas. No se ha realizado commit, push ni deploy de esta conversion.

Actualizacion de registro automatico: consultar [DANA_PUSH_INTEGRATION.md](DANA_PUSH_INTEGRATION.md). Las validaciones de instalacion de esta guia se conservan; el registro ahora llama a la Lambda existente.

## Compilar y probar

```sh
npm install
npm run build
npm run test:push
npm run preview -- --host 127.0.0.1 --port 4176
```

`build` elige la demo por `AWS_BRANCH` o por la rama Git local. `build:push` fuerza la demo; `build:portal` conserva el portal original. El desarrollo de la demo usa `dev:push`. Los recursos offline se comprueban con el build de produccion, no con el servidor de desarrollo.

## Configuracion y coexistencia

- Manifest: nombre DANA Push Experience, corto DANA Push, `id`, `start_url` y `scope` `/`, `display: standalone`, colores `#DD5736` y `#F5F7FA`.
- PNG de campana Lucide sobre naranja: 192, 512, maskable 512 con margen seguro, Apple 180 y favicon 32. `npm run icons:pwa` los regenera; no requiere recursos externos.
- Vite incorpora manifest, theme color, Apple Touch Icon, metadatos moviles y `viewport-fit=cover` exclusivamente en el HTML de la demo. No cambia la entrada del portal.
- Integracion manual con Workbox, sin un segundo worker de vite-plugin-pwa. Instalacion y `getToken()` comparten `/firebase-messaging-sw.js`, scope `/`, mediante `registerSharedWorker()`.
- El precache tiene revisiones por contenido del HTML, JS, CSS, manifest e iconos. Solo permite navegacion offline a la ruta `/`; no cachea llamadas Firebase, tokens, formulario ni endpoints DANA.
- El worker no se incluye en su propio precache. `updateViaCache: none`, `skipWaiting`, `clients.claim` y recarga ante cambio de controlador mantienen interfaz y configuracion compilada alineadas. Esa recarga puede interrumpir un formulario abierto durante una actualizacion.
- Se conservan `VITE_FIREBASE_*`, `getToken` con la misma VAPID publica y worker explicito, `onMessage`, `onBackgroundMessage` y el listener foreground al recargar un origen ya autorizado.
- Firebase muestra payloads `notification` automaticamente. Solo los payloads exclusivamente `data` llaman a `showNotification`; admiten `title`, `body`, `icon`, `image` y destino HTTPS. En mensajes `notification`, configurar icono/imagen/link desde el envio DANA/FCM.
- El clic cierra la notificacion, enfoca una ventana del origen de destino o la abre y recupera el contenido desde IndexedDB. Para recuperar el mensaje en esta app, el destino debe ser su origen y su ruta `/`, opcionalmente con query. Un destino externo sigue siendo externo.
- Historial local limitado a 50 eventos, agrupados por message ID cuando existe. Recibida, clic y apertura se registran por interacciones observadas; apertura no significa lectura. No hay tracking externo ni DynamoDB. El formulario llama a la Lambda existente para iniciar Start Conversation; no se crearon nuevas Lambdas.

## Instalacion

**Escritorio Chrome/Edge:** abrir la URL HTTPS en perfil normal. Usar Instalar aplicacion cuando el navegador emita `beforeinstallprompt`, o la opcion de instalacion del navegador. Abrir desde el icono creado. La aceptacion del dialogo sola no se interpreta como instalacion completada. En pestañas normales puede no ser posible detectar una instalacion existente; el estado independiente se obtiene de `display-mode` o `navigator.standalone`.

**Android Chrome:** abrir la URL HTTPS, instalar desde el boton disponible o el menu del navegador, abrir el icono DANA Push y completar el mismo formulario con consentimiento. Permitir notificaciones: el token se genera y se envia a la Lambda automaticamente. La web compatible tambien permite registrarse sin instalar.

**iPhone/iPad:** Safari > Compartir > Anadir a pantalla de inicio > activar Abrir como app si aparece > Anadir. Abrir desde ese icono, no desde la pestaña Safari. El flujo Push requiere Web Push del sistema (iOS/iPadOS 16.4 o posterior), APIs disponibles y soporte real de Firebase. El permiso se pide al enviar el formulario, dentro de una accion del usuario. No se muestra un boton de instalacion inoperante en iOS.

## Compatibilidad y limitaciones

Instalacion, Notifications/Push APIs y `isSupported()` de Firebase son comprobaciones independientes. Una instalacion no confirma token ni entrega. En modo independiente sin soporte se muestra: "Tu aplicación se instaló correctamente, pero el registro Push mediante Firebase no está disponible en este entorno."

La tabla oficial actual de Firebase incluye Safari/iOS para Cloud Messaging, pero eso no garantiza el registro ni la entrega en cualquier version, perfil o dispositivo. Se verifica en ejecucion y, despues, con un token y un envio real. La abstraccion de capacidades permite añadir un adaptador Web Push estandar mas adelante, sin activar ahora otro proveedor.

El navegador/SO controla permisos, ahorro de energia, modo concentracion, formato y marca del remitente. No se oculta forzosamente Chrome ni el dominio en macOS. La imagen es opcional y no universal. La app no recibe mensajes nuevos sin conectividad; la caché permite abrir la interfaz previamente visitada, no generar tokens offline.

El historial no es una bandeja de servidor: conserva solo lo que Firebase/la app hayan procesado localmente. Puede perderse al borrar datos o no estar disponible en privado. Sin message ID no se garantiza deduplicacion. No enviar informacion sensible en esta demo. El token local de desarrollo no sirve para otro origen; obtenerlo en la instalacion/origen que recibira el Push.

Fuentes: [Firebase: entornos compatibles](https://firebase.google.com/docs/web/environments-js-sdk), [Firebase: cliente Web](https://firebase.google.com/docs/cloud-messaging/web/get-started), [WebKit: Web Push en iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Workbox: precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching), [instalacion personalizada](https://web.dev/articles/customize-install).

## Despliegue que debe realizar el responsable

1. Revisar y publicar los cambios unicamente en `dana-push-experience`. Conservar las variables Firebase y la VAPID que ya funcionan. No modificar `main` ni el backend.
2. Compilar con la especificacion actual de la rama (`npm ci`, `npm run build:push`, artefactos `dist`) o con `npm run build` y `AWS_BRANCH=dana-push-experience`. No hace falta Firebase Hosting.
3. Verificar en HTTPS que `/manifest.webmanifest` devuelve JSON, `/firebase-messaging-sw.js` JavaScript, y `/pwa/*.png` imagenes, todos 200. Un rewrite SPA no debe devolver HTML para estos archivos; excluir tambien `.webmanifest` si la regla actual reescribe extensiones desconocidas.
4. Revisar manualmente en Amplify las cabeceras: `Cache-Control: no-cache` para worker, manifest e index; assets con hash pueden usar cache larga immutable. No se ha aplicado ninguna configuracion externa desde esta tarea.
5. En una visita previamente controlada, recargar online y comprobar un solo worker activo con scope `/`, nombre nuevo y recursos nuevos. Probar tambien un perfil limpio. No borrar suscripciones como procedimiento normal de actualizacion.

## Primera prueba y matriz A-F

La primera prueba usa el formulario y la Lambda configurada, sin copiar tokens. Para envios manuales adicionales de foreground/background, usar el envio DANA existente, Application ID `DANA-PUSH-Demo`, token del diagnostico en UFID, titulo/cuerpo distintos y destino `https://dana-push-experience.d1al7cfbz0rrq3.amplifyapp.com/`. La confirmacion del registro automatico no confirma entrega del Push.

| Prueba | Recorrido y criterio |
| --- | --- |
| A: Chrome/macOS | Instalar en perfil normal, abrir icono, registrar y permitir. Exigir token no vacio y un envio DANA real visible; permiso y token solos no validan entrega. |
| B: Android | Repetir A en telefono real con Chrome. Comprobar icono, standalone, token y notificacion del sistema. |
| C: iPhone | Instalar desde Safari y abrir icono. Comprobar standalone, APIs y SDK por separado. Si compatible, obtener token y enviar desde DANA; si no, comprobar aviso sin exito ni token ficticio. |
| D: Apertura | Con app abierta en segundo plano, pulsar Push: enfoca sin duplicar ventana y muestra contenido/ID. Repetir con app cerrada: abre destino y recupera mensaje; solo entonces mostrar abierta. |
| E: Foreground | App visible: enviar mensaje, comprobar banner e historial con un PUSH_RECEIVED observado. Abrirlo y comprobar PUSH_CLICKED/PUSH_OPENED, sin llamar lectura a ninguno. |
| F: Background | App en segundo plano/cerrada: enviar payload notification y despues uno data. Una notificacion por mensaje, con ID distinguible; clicar y verificar historial. Imagen solo si la plataforma la admite. |

Adicionales: recargar sin red despues de primera visita; registro debe pedir conectividad. Desplegar una segunda version y comprobar actualizacion del worker/interfaz sin Firebase antiguo. Probar denegacion de permisos, guia iOS y borrado del historial.

## Archivos de esta conversion

**Creados:** `DANA_PUSH_PWA.md`, `public/manifest.webmanifest`, `public/pwa/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.png`; `scripts/build.mjs`, `scripts/generate-pwa-icons.mjs`; `src/push/platform.ts`, `usePwa.ts`, `InstallExperience.tsx`, `NotificationsHistory.tsx`; `src/services/serviceWorkerService.ts`, `pushCapabilities.ts`; `tests/pwa-assets.test.mjs`.

**Modificados:** `package.json`, `package-lock.json`, `vite.config.ts`, `src/push/PushExperience.tsx`, `eventStore.ts`, `firebase-messaging-sw.js`, `push.css`, `src/services/pushService.ts`, `tests/push-services.test.mjs`, `DANA_PUSH_EXPERIENCE.md`.

Dependencias añadidas: Workbox core/precaching/routing en runtime; sharp en desarrollo para iconos y comprobaciones. No se alteraron las versiones Firebase ni las credenciales. Hay 16 alertas npm audit preexistentes (9 altas, 5 moderadas, 2 bajas); no se aplico audit fix ni cambios generales del stack.

## Resultado local

`npm install`, `npm run build`, `npm run build:portal` y 25 pruebas de `npm run test:push` completados. Chromium real comprobo manifest sin errores, unico worker raiz, permiso default sin solicitud al cargar y apertura offline del formulario. En un perfil temporal normal, los criterios de instalacion no presentaron errores y se emitio el evento real que muestra el boton. El perfil privado bloquea instalacion por `in-incognito`; no se afirma haber instalado la PWA en el sistema operativo.

Se revisaron capturas de 320, 390, 768 y 1440 px sin desbordamiento horizontal; los inputs de telefono usan 16 px. En emulacion iPhone se comprobaron guia contextual y estado standalone sin PushManager con el aviso exacto solicitado. Con fixtures explicitos en IndexedDB real se comprobo recuperar titulo/cuerpo/ID de un clic al recargar, distinguir Recibida de Abierta y borrar historial/banner. Los fixtures se eliminaron al terminar. Las capturas estan en `output/playwright/`, ignoradas por Git.

Las pruebas automatizadas usan dobles explicitos para permisos/FCM y estados iOS; no prueban entrega real. No se ha validado recepcion movil ni un envio DANA nuevo durante esta conversion. Es obligatorio ejecutar A-F en dispositivos reales despues del despliegue autorizado.
