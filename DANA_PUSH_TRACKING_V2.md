# Tracking V1 y V2

La PWA conserva el registro V1 y admite eventos V2 enviados directamente desde DANA. No cambia Firebase, VAPID, token FCM, Lambda ni Start Conversation. Recibir V2 requiere una suscripcion FCM existente y permisos del dispositivo; no requiere volver a completar el formulario.

## Configuracion

- V1: `VITE_DANA_PUSH_API_URL`, sin cambios. Registro y eventos V1 usan esa URL.
- V2: `VITE_DANA_PUSH_V2_API_URL`, exclusivamente para eventos V2.

URL V2 proporcionada y configurada en `.env.push.local` (archivo local ignorado por Git):

```dotenv
VITE_DANA_PUSH_V2_API_URL=https://rjrmuofdx75a3bsrzrbgsjydyq0etlld.lambda-url.us-east-1.on.aws/
```

Para publicar, agregar esta variable al entorno de build de la rama dana-push-experience en Amplify, sin sustituir la variable V1. El build existente incorpora las variables publicas al bundle React y al mismo Worker. No se modifico Amplify ni se hizo deploy desde esta tarea. Las credenciales firmadas llegan con cada mensaje, nunca se incluyen en el build.

## Deteccion y Almacenamiento

La presencia de `data.event_auth_token` identifica V2. Si falta en el payload original, se conserva V1. Un valor vacio o de tipo incorrecto no autoriza el reporte y nunca provoca fallback a V1.

La cola guarda la credencial V2 y el evento en una misma transaccion de dana-push-receipts. Las asociaciones V1 mantienen sus claves y valores. Las V2 usan una clave interna JSON de `[v2, push_ref, messageId]` en el mismo store associations; reference conserva la referencia original y eventAuthToken conserva el token opaco. La clave interna nunca se envia al backend. Una credencial diferente para la misma notificacion no sustituye la anterior.

Los eventos V2 usan claves `[v2, pushRef, messageId, eventType, accion]`; V1 conserva sus claves anteriores. Orden, leases y deduplicacion se separan por version. V2 mantiene una secuencia por notificacion, sin bloquear otra notificacion que comparta la referencia. Las versiones y stores de todas las bases existentes permanecen intactos; no se elimina ningun evento ni asociacion.

El historial visual guarda el payload necesario para abrir y usar el CTA, pero elimina recursivamente las variantes de event_auth_token. La marca interna danaTrackingVersion=v2 permite reconocer despues ese payload sin la credencial, obteniendola de associations. Tambien se protegen el callback de primer plano y los mensajes del Worker a React; la interfaz no muestra JSON tecnico. Las notificaciones creadas por nuestro Worker incluyen solo correlacion y contenido/CTA normalizados, sin credencial; las automaticas de Firebase conservan FCM_MSG. No se registran tokens en consola. Ver [CTA nativo](DANA_PUSH_NATIVE_CTA.md).

## Contrato y Reintentos

Ambas versiones conservan las ocho propiedades del contrato: action=event, push_ref real, eventAuthToken de su asociacion, event, messageId, timestamp UTC original, timezone IANA capturada y accion. RECEIVED y OPENED usan accion vacia; CLICKED usa data.cta_action. No se envian PROJECT_ID, TABLE_CODE ni datos del formulario en estos POST.

V2 nunca usa el endpoint V1, incluso si su URL falta o es invalida. En ese caso conserva la cola sin programar un bucle de reintento. La ausencia del endpoint V1 no bloquea V2. Errores temporales conservan los datos originales y el backoff existente; 400/403 y otros 4xx terminales mantienen su comportamiento. Aceptacion sigue requiriendo HTTP 202, success=true y uploadAccepted=true, no prueba procesamiento terminado de Contact Manager.

El CTA sigue siendo dinamico y HTTPS. Recibir, restaurar o abrir un mensaje no inventa clics. Un clic se guarda antes de navegar y no espera la respuesta de red. Ningun evento V2 invoca register ni genera otro token FCM.

## Validacion

87 pruebas automatizadas aprobadas: V1 existente, V2 foreground/background sin registro, contratos y endpoints separados, claves heredadas, referencias/IDs coincidentes entre versiones, credenciales por mensaje, conflictos, ausencia de URL/credencial, deduplicacion, reintentos, conservacion de fecha/zona, 403 terminal, redaccion recursiva e historial persistido sin credenciales.

Chromium con IndexedDB real y HTTP simulado verifico coexistencia del historial V1, recepcion V2, apertura V2 sin clic automatico, CTA EXPLORAR_NOVEDADES, recarga sin nuevos reportes, contrato sin campos de proyecto/lista y ausencia de tokens visibles. Capturas de 320, 390 y 1440 px sin desbordamiento y con imagen cargada. Solo se usaron credenciales ficticias; todas las solicitudes AWS de la prueba fueron interceptadas. No se invoco ninguna Lambda real ni se registro un contacto real.

Despues del despliegue, enviar desde DANA un mensaje con push_ref, event_auth_token, Titulo, IMAGEN y CTA completos a una suscripcion existente. Verificar recepcion, apertura y clic sin formulario, POST exclusivamente a V2 y actualizacion real de la misma fila en Contact Manager. Repetir en Chrome y PWA instalada en iPhone. Esa comprobacion real no se realizo desde esta tarea.
