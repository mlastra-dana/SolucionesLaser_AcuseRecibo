# CTA nativo V1 / V2

## Comportamiento

- Primer plano: onMessage conserva la recepcion y pide al Worker mostrar una notificacion con el CTA validado del payload.
- Segundo plano data-only: onBackgroundMessage conserva la recepcion y muestra una notificacion mediante registration.showNotification.
- Segundo plano notification + data: Firebase ya muestra la notificacion antes de llamar onBackgroundMessage. No creamos una segunda ni cerramos/reconstruimos la original.
- Si Notification.maxActions es un numero positivo, nuestra notificacion incluye una accion cuyo title es cta_label y cuyo action es cta_action. Sin CTA HTTPS completo, o sin capacidad de acciones, no incluye botones.
- El cuerpo registra solamente PUSH_OPENED y abre/enfoca la PWA con la identidad de la notificacion en el parametro notification. React selecciona ese detalle del historial, aunque haya aperturas mas recientes de otros mensajes. No requiere formulario.
- El boton nativo registra solamente PUSH_CLICKED con accion=cta_action y abre cta_url. No inventa una apertura adicional. Una accion desconocida conserva el fallback al detalle, sin clic de campana.
- notificationclick espera el guardado local antes de navegar. event.waitUntil mantiene activo el reporte sin esperar HTTP para abrir el destino. El contrato, endpoints V1/V2, leases, deduplicacion y reintentos existentes no cambian.
- Los datos de nuestras notificaciones contienen solo ID, referencia, version y campos normalizados de contenido/CTA. La credencial permanece en associations de IndexedDB. Los mensajes automaticos de Firebase conservan su estructura interna FCM_MSG; no se imprimen ni se representan en la interfaz.
- IndexedDB no cambia de version ni se elimina informacion. Sin almacenamiento local disponible no es posible garantizar persistencia; la navegacion conserva el comportamiento tolerante a fallos existente.

## Ajuste necesario en DANA para segundo plano

La evidencia anterior del proyecto contiene notification.body junto con data.Titulo y parametros personalizados. El SDK Firebase instalado confirma que notification + data activa la visualizacion automatica antes del callback. No se inspecciono ni modifico el nodo DANA o el payload de una nueva entrega real en esta tarea.

Para que esta PWA controle los botones del sistema tambien en segundo plano, el nodo PUSH debe poder emitir un mensaje FCM **data-only**, sin el objeto notification. Todos los campos personalizados existentes se conservan. Ademas debe incluir el cuerpo en data.Mensaje (o data.body), porque al eliminar notification tambien desaparece notification.body:

```json
{
  "data": {
    "Titulo": "TITULO_DINAMICO",
    "Mensaje": "CUERPO_DINAMICO",
    "IMAGEN": "https://example.com/campaign.png",
    "push_ref": "PUSH-REFERENCIA",
    "event_auth_token": "CREDENCIAL_FIRMADA",
    "cta_label": "ETIQUETA_DINAMICA",
    "cta_action": "ACCION_DINAMICA",
    "cta_url": "https://example.com/campaign"
  }
}
```

Este es un ajuste pendiente del emisor, no un cambio realizado ni una opcion confirmada del nodo DANA. Si DANA no permite data-only, se mantiene notification + data y el CTA se ofrece en el detalle de la PWA. No basta con agregar cta_label en data para que Firebase lo convierta en actions. Si se conserva el modo automatico, el titulo y cuerpo nativos deben estar en notification.title y notification.body; data.Titulo solo alimenta nuestra normalizacion.

## Limites por plataforma

- Chrome / Edge: usar la capacidad expuesta por Notification.maxActions; incluso con acciones soportadas, el sistema puede limitar su representacion o requerir expandir la notificacion.
- macOS: no se garantiza un boton visible en cada banner de Chrome. La presentacion depende del navegador, de macOS y de la configuracion de notificaciones; la web no puede forzarla.
- Safari / iPhone instalado / Firefox: no asumir soporte de botones. Cuando la capacidad falta o es cero, seleccionar el cuerpo abre el detalle con el CTA de React. Se conserva el Worker y la instalacion iOS existentes.
- Las pruebas automatizadas verifican opciones y eventos del Worker, no botones del centro de notificaciones real. La presentacion y entrega en Chrome/macOS e iPhone deben probarse con dispositivos y mensajes reales despues del deploy.

Fuentes: [recepcion y visualizacion automatica de Firebase](https://firebase.google.com/docs/cloud-messaging/web/receive-messages), [limite de acciones nativas](https://developer.mozilla.org/en-US/docs/Web/API/Notification/maxActions_static), [notificationclick y action](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event).
