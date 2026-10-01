# DANA Push Experience

Demo independiente de Firebase Cloud Messaging para el proyecto existente `dana-push-demo-vzla`. Desarrollo en `dana-push-experience`; el portal original conserva su entrada y sus comandos. No se modifican las funciones Lambda existentes.

## Ejecutar

```sh
npm install
npm run dev:push -- --host 127.0.0.1 --port 5174
npm run build:push
npm run test:push
npm run preview -- --host 127.0.0.1 --port 4174
```

`npm run build` y `npm run dev` siguen seleccionando el portal original. Para esta demo se debe usar el modo `push`. No hay autenticación, Firebase Hosting, Firebase Admin SDK ni credenciales privadas.

## Variables públicas

Crea `.env.local` a partir de los nombres en `.env.example` o configúralos para **esta rama** en Amplify. No subir el archivo real a Git.

| Variable | Valor requerido |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | API key de la aplicación Web existente |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain de la configuración Web |
| `VITE_FIREBASE_PROJECT_ID` | `dana-push-demo-vzla` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket de la configuración Web |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID de la aplicación Web |
| `VITE_FIREBASE_APP_ID` | App ID de la aplicación Web |
| `VITE_FIREBASE_MEASUREMENT_ID` | Opcional; Analytics no se inicializa |
| `VITE_FIREBASE_VAPID_KEY` | Clave **pública** Web Push de Cloud Messaging |
| `VITE_DANA_PUSH_API_URL` | Reservada para la futura Lambda; no se llama en fase 1 |
| `VITE_PUSH_DEMO_MODE` | `true` para diagnóstico; `false` para ocultarlo |

Se valida la configuración antes de pedir permiso. Nombre y apellido son obligatorios, con máximo de 80 caracteres. El permiso solo se solicita tras enviar el formulario y aceptar el consentimiento. No existe un token simulado ni un envío automático.

## AWS Amplify

1. Conecta la rama `dana-push-experience` a Amplify Hosting, con un dominio/origen independiente. No cambiar el despliegue de `main`.
2. Para el build de **esta rama**, usa el contenido de `amplify-push.yml` en la configuración de compilación de Amplify. Este archivo es una plantilla, no se detecta automáticamente como `amplify.yml`. Si hay una especificación compartida para todas las ramas, utiliza una aplicación Hosting separada para esta rama. No ejecutar `ampx pipeline-deploy`: la demo solo compila frontend.
3. Configura las variables de la tabla como variables de build. Las variables `VITE_*` son públicas y quedan incorporadas en el bundle; nunca colocar credenciales de servidor allí.
4. Ejecuta `npm ci` y `npm run build:push`; publica `dist`.
5. Verifica HTTPS y que `/firebase-messaging-sw.js` devuelve JavaScript, no HTML. La compilación genera ese archivo en la raíz de `dist` y empaqueta Firebase modular junto a su configuración pública. No usa `import.meta.env` en `public/`.
6. Esta demo usa una sola ruta `/` y no necesita un rewrite SPA general. Si existe uno en la configuración actual, excluye los archivos estáticos, especialmente el Service Worker. Puedes usar un rewrite 200 de rutas sin extensión a `/index.html`: `</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|mjs)$)([^.]+$)/>`.
7. Opcional: cabecera `Cache-Control: no-cache` para `/firebase-messaging-sw.js`. El registro usa `updateViaCache: none`; no hay caché offline de páginas.

Si la API key pública tiene restricciones de origen, habilita el nuevo origen HTTPS en la configuración correspondiente del proyecto existente. Un origen o perfil nuevo necesita registrar su propio navegador y obtener su token. No reutilizar el token de localhost para otro dominio.

## Obtener un token y probar el primer Push

1. Abre la URL HTTPS en Chrome (o localhost en desarrollo), introduce nombre y apellido, acepta el consentimiento y pulsa **Registrarme y recibir mi Push**.
2. Selecciona **Permitir**. Si el permiso está bloqueado, abre los controles del sitio junto a la dirección, habilita Notificaciones y recarga. Si cierras el diálogo, se muestra un mensaje y puedes reintentar.
3. La confirmación aparece únicamente después de que `getToken()` devuelva un token no vacío. Esto confirma el registro local en FCM; no prueba todavía un envío desde DANA.
4. Abre **Diagnóstico de la demo** y copia el token. Nombre, apellido y token se mantienen solo en estado React. Firebase gestiona sus propios datos de suscripción en el navegador; la app no persiste el visitante ni copia su token en bases públicas.
5. Usa tu integración DANA existente y el nodo PUSH con Application ID **DANA-PUSH-Demo**, introduciendo el token y el texto personalizado en tu conversación de prueba. No se crean endpoints ni credenciales ni se llama DANA desde el frontend.
6. Con la pestaña visible, verifica el banner y `PUSH_RECEIVED` en primer plano. El banner solo aparece para un mensaje real. **Abrir mensaje** captura la interacción y muestra el payload.
7. Envía otra prueba con la pestaña en segundo plano. Firebase muestra automáticamente mensajes con `notification`. Para mensajes solo `data`, el worker muestra una notificación usando `data.title` y `data.body`. No se vuelve a mostrar manualmente un payload con `notification`.
8. Haz clic en la notificación: se enfoca o abre la demo en el mismo origen y se registran `PUSH_CLICKED` y, si la apertura devuelve una ventana, `PUSH_OPENED`. Para la demo, el destino se mantiene en este origen y no se navega a enlaces arbitrarios del payload. Verifica el historial y el `messageId`.

La configuración del sistema operativo puede silenciar las notificaciones aun con permiso concedido. El soporte depende del navegador y del dispositivo; el flujo no promete compatibilidad universal. Reiniciar el formulario no revoca el permiso ni elimina la suscripción FCM. Para revocarlo, usa los permisos del sitio.

## Eventos y diagnóstico

- `PUSH_RECEIVED`: callback observable de Firebase, con contexto foreground/background.
- `PUSH_CLICKED`: clic real en la notificación del sistema o en Abrir mensaje del banner.
- `PUSH_OPENED`: apertura del contenido del banner o foco/apertura de la ventana tras el clic. **No equivale a lectura**.
- `src/push/eventStore.ts` es el punto desacoplado para el futuro transporte de eventos. No hay webhook ni llamadas a AWS.
- Se mantienen hasta 50 eventos/payloads en IndexedDB **local del navegador**, para conservar diagnósticos incluso cuando la pestaña estaba cerrada. No es un almacenamiento público ni un registro de visitantes. Se deduplican por tipo y message ID si está presente. Sin ID no se puede garantizar deduplicación de reenvíos. Se pueden borrar desde el diagnóstico.
- No se generan confirmaciones de entrega o lectura. El historial puede no estar disponible en modo privado y se pierde si se borran los datos del sitio. Evita enviar datos sensibles en los payloads de la demo.
- `VITE_PUSH_DEMO_MODE=false` oculta el panel, no constituye una autorización ni un control de seguridad.

## Archivos y dependencias

Nuevos: `src/push/main.tsx`, `PushExperience.tsx`, `push.css`, `firebaseConfig.ts`, `firebase-messaging-sw.js`, `eventStore.ts`; servicios `src/services/pushService.ts` y `danaService.ts`; `amplify-push.yml`; esta guía, `tests/push-services.test.mjs` y `public/push-notification.png` (bitmap del icono Lucide utilizado en la demo).

Modificados: `vite.config.ts` (entrada y worker solo para modo push), `package.json`, `package-lock.json`, `.env.example`, `.gitignore`. El portal y las Lambdas permanecen con sus archivos originales.

Dependencias: `firebase`, `lucide-react`; `esbuild` como dependencia de desarrollo para empaquetar el worker modular. React, Vite, TypeScript y Tailwind ya estaban presentes. Fuente Inter desde Google Fonts con fallback sans-serif.

## Validación y segunda fase

Las pruebas de servicios usan dobles explícitos del navegador y Firebase para verificar permisos, limpieza de listeners y notificaciones duplicadas; no sustituyen una prueba de FCM real. La validación del token y entrega reales requiere las variables públicas y un envío desde el proyecto operativo. Las capturas de escritorio/móvil y resultados de compilación se revisan durante la implementación.

Validación realizada: `npm install`, `npm run build`, `npm run build:push` y 10 pruebas de `npm run test:push` completadas. Chrome activó el worker real sin solicitar permiso al cargar; se comprobaron campos vacíos, consentimiento y configuración ausente. Las vistas de 320, 390, 768 y 1440 px no presentan desbordamiento horizontal. Se comprobó IndexedDB real: deduplicación por message ID y límite de 50 eventos. La confirmación, diagnóstico, banner y reinicio se probaron con un doble de servicio explícito, retirado al terminar. Las capturas locales quedan en `output/playwright/` (ignoradas por Git).

No se validó un token FCM ni un envío DANA reales: las variables Firebase no estaban disponibles en `.env.local`. No se ha publicado la rama en Amplify desde esta implementación.

`npm audit` reportó 16 alertas (9 altas, 5 moderadas, 2 bajas), incluidas herramientas existentes y dependencias transitivas de Firestore/gRPC instaladas por el paquete Firebase completo. La demo importa únicamente App y Messaging; no utiliza Firestore ni gRPC. No se ejecutó `npm audit fix --force` ni se cambiaron versiones de dependencias del portal para resolver estas alertas. Conviene revisarlas en una tarea de mantenimiento del stack antes de promover el repositorio a producción.

Referencia oficial: [recepción de mensajes Firebase Web](https://firebase.google.com/docs/cloud-messaging/web/receive-messages), que describe el empaquetado del worker modular y la visualización automática de payloads `notification`; [configuración del cliente Web](https://firebase.google.com/docs/cloud-messaging/web/get-started).

Pendiente: implementar el contrato y la Lambda de Start Conversation, conectar `registerPushVisitor()` al endpoint intermedio, validar el payload de servidor y añadir transporte de eventos a una Lambda. El Push seguirá enviándose desde DANA, no desde Lambda. En fase 1 `registerPushVisitor()` devuelve `pending`, aun cuando se configure la URL futura.
