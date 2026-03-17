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

## Integración posterior (backend/Lambda)
- La firma se captura en frontend y se serializa como imagen PNG en base64 (`signatureDataUrl`).
- El mock `generateSignedPreview` usa esa firma para crear una version visual firmada del documento dentro de la app.
- El mock `submitSignedAck` ya recibe la firma para futura persistencia/ensamble de PDF oficial.
- La generacion del PDF oficial firmado y el envio por correo se conectaran en una fase posterior con Lambda/API.
