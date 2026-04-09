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
- aceptar `POST` y `OPTIONS`,
- recibir `token`, `signedAt`, `signatureDataUrl` y `signedPdfBase64`,
- guardar firma y PDF en S3,
- responder `ackUrl`, `signatureUrl` e `invoiceUrl`.

Variable de entorno requerida en el frontend:
- `VITE_SUBMIT_SIGNED_ACK_URL`

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
- La siguiente fase podra agregar correo y/o integracion con DANA sin cambiar este contrato base.
