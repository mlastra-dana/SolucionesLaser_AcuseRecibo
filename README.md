# Portal_Acuse_Recibo_DANAconnect

Frontend corporativo en React para gestionar el tramite directo de acuse de recibo de factura digital.

## Objetivo
Este portal permite que un usuario:
- ingrese directamente al tramite desde el enlace del correo,
- visualice el documento base del acuse,
- firme en una casilla real de firma (canvas),
- genere dentro del frontend un preview del documento firmado,
- confirme el acuse y vea la pantalla final.

El portal genera el PDF firmado en frontend y consume una Lambda externa para persistir el PDF y la firma en S3.

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

## Datos de demo
En esta version demo, los datos usados para generar el acuse en frontend estan alineados manualmente con la factura local `public/mock/factura-real.pdf`.

La fuente actual de esos datos es `src/mocks/ackMock.ts`, asi que cualquier cambio visual en la factura demo debe reflejarse tambien ahi para que acuse y factura sigan siendo coherentes.

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

## Integración actual con Lambda
El frontend consume una Lambda externa mediante `VITE_SUBMIT_SIGNED_ACK_URL`.

La Lambda debe:
- aceptar `POST`, `GET` y `OPTIONS`,
- recibir `token`, `customerEmail`, `customerName`, `documentNumber`, `invoiceUrl`, `signedAt`, `signatureDataUrl` y `signedPdfBase64`,
- guardar firma, PDF firmado y estado resumido en S3,
- enviar correo con el acuse firmado adjunto,
- responder `ackUrl`, `signatureUrl`, `invoiceUrl` y el estado del acuse por token.

Variable de entorno requerida en el frontend:
- `VITE_SUBMIT_SIGNED_ACK_URL`

Variables de entorno requeridas en el backend de Amplify:
- `ACK_BUCKET_NAME`
- `ACK_BUCKET_REGION`
- `ALLOWED_ORIGIN`
- `FROM_EMAIL`
- `PORTAL_BASE_URL`

Ejemplo de consumo:

```ts
const response = await fetch(import.meta.env.VITE_SUBMIT_SIGNED_ACK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    token,
    customerEmail,
    customerName,
    documentNumber,
    invoiceUrl,
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
  "invoiceUrl": "https://...",
  "confirmationCode": "ACK-AB12CD34"
}
```

Tambien se expone un `GET /ack-status?token=...` para que el portal pueda reabrirse directamente en la vista de acuse firmado cuando el usuario vuelva a entrar desde el correo original.

## Integración posterior (backend/Lambda)
- La firma se captura en frontend y se serializa como imagen PNG en base64 (`signatureDataUrl`).
- El PDF base del acuse se genera/carga en frontend y se renderiza en preview con `pdfjs-dist`.
- El servicio `pdfSigningService` inserta la firma en el PDF real con `pdf-lib` y regenera el archivo firmado.
- La siguiente fase podra agregar correo y/o integracion con DANA sin cambiar este contrato base.
