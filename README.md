# Portal_Acuse_Recibo_DANAconnect

Frontend corporativo en React para gestionar el tramite directo de acuse de recibo de factura digital.

## Objetivo
Este portal permite que un usuario:
- ingrese directamente al tramite desde el enlace del correo,
- visualice el documento base del acuse,
- firme en una casilla real de firma (canvas),
- genere dentro del frontend un preview del documento firmado,
- confirme el acuse y vea la pantalla final.

La integracion real con AWS Lambda/API y el envio de correo se implementara en una fase posterior.

## Stack
- React 18
- Vite
- TypeScript
- TailwindCSS
- React Router
- pdf-lib
- pdfjs-dist

## Instalación
```bash
npm install
```

## Desarrollo local
```bash
npm run dev
```

## Build de producción
```bash
npm run build
```

## Preview local del build
```bash
npm run preview
```

## Nota para AWS Amplify (SPA)
En Amplify Hosting, configura redirección para SPA:
- Source address: `/<*>`
- Target address: `/index.html`
- Type: `200 (Rewrite)`

## Backend real con Amplify Gen 2
- Backend code-first en `amplify/`.
- Lambda HTTP `submit-signed-ack` expuesta en `POST /submit-signed-ack`.
- La Lambda:
  - recibe el PDF firmado y la firma desde frontend,
  - guarda ambos archivos en S3,
  - responde `ackUrl`, `signatureUrl` e `invoiceUrl`,
  - no envía correo y no dispara DANA en esta fase.

### Variables de entorno requeridas
- `ACK_BUCKET_NAME`
- `ACK_BUCKET_REGION`
- `ALLOWED_ORIGIN`
- `INVOICE_URL`

Valor requerido para `INVOICE_URL` en esta demo:
```text
https://wsqa.solucioneslaser.com/pruebapdf-war/recursos/services/generar/flbzlgUTxUphYyRhGjRMuA==
```

### Consumo del endpoint desde frontend
El frontend actual no fue modificado. Para conectar el flujo real, el submit final debe hacer un `POST` JSON al endpoint publicado por Amplify:

```ts
const response = await fetch(`${apiBaseUrl}/submit-signed-ack`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    token,
    customerEmail,
    customerName,
    documentNumber,
    signedAt,
    signatureDataUrl,
    signedPdfBase64
  })
});

const result = await response.json();

if (result.success && result.invoiceUrl) {
  window.open(result.invoiceUrl, '_blank', 'noopener,noreferrer');
}
```

`signedPdfBase64` debe enviarse como base64 puro del PDF firmado. La respuesta esperada es:

```json
{
  "success": true,
  "status": "SIGNED",
  "ackUrl": "https://...",
  "signatureUrl": "https://...",
  "invoiceUrl": "https://wsqa.solucioneslaser.com/pruebapdf-war/recursos/services/generar/flbzlgUTxUphYyRhGjRMuA=="
}
```

## Integración posterior (backend/Lambda)
- La firma se captura en frontend y se serializa como imagen PNG en base64 (`signatureDataUrl`).
- El PDF base del acuse se genera/carga en frontend y se renderiza en preview con `pdfjs-dist`.
- El servicio `pdfSigningService` inserta la firma en el PDF real con `pdf-lib` y regenera el archivo firmado.
- El mock `submitSignedAck` sigue disponible mientras se conecta el frontend al endpoint real.
- La siguiente fase podra agregar correo y/o integracion con DANA sin cambiar este contrato base.
