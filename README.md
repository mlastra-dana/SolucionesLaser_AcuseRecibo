# Portal_Acuse_Recibo_DANAconnect

Frontend corporativo en React para gestionar el trámite directo de acuse de recibo de factura digital integrado con DANAconnect y una Lambda de soporte en AWS.

## Resumen ejecutivo
Este proyecto implementa un portal de firma de acuse de recibo para Soluciones Laser. El usuario entra desde un enlace enviado por correo con un parámetro `dana`, visualiza el documento, firma digitalmente dentro del portal y confirma el trámite. El sistema genera el PDF firmado, lo persiste en S3, lo sube al storage administrado por DANA para que pueda ser usado como adjunto de correo y actualiza los campos del registro en DANA.

El flujo final validado quedó así:

1. DANA envía un correo con un enlace al portal que incluye `?dana=<token>`.
2. El portal consulta el caso en DANA usando el endpoint legacy `GET /api/1.0/rest/conversation/data/{dana}`.
3. DANA responde con `record` y `requestID`.
4. El portal genera un PDF base del acuse y lo presenta para revisión.
5. El usuario firma en canvas.
6. El frontend inserta la firma en el PDF con `pdf-lib`.
7. La Lambda guarda la firma y el PDF firmado en S3.
8. La Lambda sube el PDF firmado a DANA vía `file/upload`.
9. DANA devuelve una referencia tipo `s3://WS/...`.
10. La Lambda dispara el `Trigger` para actualizar el registro con `AckUrl`, `AckId`, `status`, `NombreCliente`, etc.
11. DANA puede usar esa referencia para enviar el correo con el acuse adjunto.

## Objetivo funcional
Este portal permite que un usuario:

- ingrese directamente al trámite desde el enlace del correo,
- visualice el documento base del acuse,
- firme en una casilla real de firma sobre canvas,
- genere dentro del frontend un preview del documento firmado,
- confirme el acuse,
- y vea la pantalla final de confirmación.

## Alcance implementado
- lectura del parámetro `dana` desde la URL del portal,
- consulta del caso en DANA,
- generación del PDF base del acuse,
- captura de firma manuscrita en frontend,
- inserción de firma, nombre del firmante, código y fecha en el PDF,
- persistencia de firma y PDF firmado en S3,
- almacenamiento de estado resumido en `latest.json` por `ackId`,
- subida del PDF firmado al endpoint de archivos de DANA,
- actualización del registro DANA mediante `Trigger`,
- reapertura del enlace para confirmar estado firmado,
- visualización de PDF con estados de carga en frontend.

## Hitos del proyecto
### 1. Portal funcional de firma
- se construyó el portal en React con Vite,
- se añadió preview de PDF,
- se añadió captura de firma y regeneración del documento firmado.

### 2. Persistencia en AWS
- se creó el flujo para guardar:
  - `signature.png`
  - `acuse-firmado.pdf`
  - `latest.json`
- todo bajo el bucket configurado en `ACK_BUCKET_NAME`.

### 3. Integración inicial con DANA
- se integró el lookup del caso usando:
  - `GET /api/1.0/rest/conversation/data/{dana}`
- se identificó que el `requestID` devuelto por DANA era la pieza correcta para usar como `ackId/token`.

### 4. Ajuste del flujo de actualización
- se actualizó el `Trigger` para enviar los campos reales del registro.
- se alinearon los códigos de campos en DANA con los nombres usados por Soluciones Laser:
  - `Email`
  - `NumeroFactura`
  - `URL_Factura`
  - `AckUrl`
  - `NombreCliente`
  - `status`
  - `AckId`

### 5. Resolución del adjunto por correo
- se validó que guardar solo una ruta S3 en el bucket propio no era suficiente para el adjunto.
- se comparó con otro proyecto funcional y se descubrió el patrón correcto:
  - guardar el archivo en S3,
  - subirlo luego a DANA con `/dana/conversation/http/rest/file/upload`,
  - usar la referencia devuelta por DANA (`s3://WS/...`) para el campo del adjunto.

### 6. Resolución del dato del firmante
- se comprobó que el problema no estaba en el render del portal sino en el acceso del usuario técnico `integraciondana` a la BD/lista de contactos.
- una vez corregidos esos permisos, DANA empezó a devolver `record` con datos reales.
- el PDF firmado quedó mostrando correctamente el firmante desde `NombreCliente`.

## Arquitectura resumida
### Frontend
- React 18
- Vite
- TypeScript
- TailwindCSS
- React Router
- `pdf-lib`
- `pdfjs-dist`

### Backend auxiliar
- AWS Lambda
- Amazon S3
- integración HTTP con DANAconnect

## Flujo de datos
### Entrada
El flujo inicia desde un enlace de correo con este formato:

```text
https://<portal>/?dana=<token>
```

### Consulta inicial del caso
El portal llama a la Lambda, y la Lambda consulta DANA usando:

```text
GET https://appserv.danaconnect.com/api/1.0/rest/conversation/data/{dana}
```

La respuesta válida esperada contiene:

```json
{
  "record": {
    "URL_Factura": "...",
    "AckUrl": "",
    "AckId": "",
    "NumeroFactura": "00000001",
    "NOMBRECLIENTE": "Maria Lastra",
    "EMAIL": "mlastra@danaconnect.com",
    "DNI": "24657722",
    "status": ""
  },
  "requestID": "21d89f62-d48f-4748-aca7-969e07926041"
}
```

### Firma y confirmación
Al confirmar:

- el frontend envía firma y PDF firmado a la Lambda,
- la Lambda persiste el archivo,
- la Lambda sube el PDF a DANA,
- DANA devuelve una referencia como:

```text
s3://WS/2026/4/dafbc3c574177536bf4ea64d89709b1e.pdf
```

- la Lambda actualiza el registro usando:

```text
POST https://appserv.danaconnect.com/event/Trigger?dana=...
```

## Endpoints relevantes
### Lookup del caso
```text
GET /api/1.0/rest/conversation/data/{dana}
```

Uso:
- traer `record`,
- obtener `requestID`,
- verificar si el caso ya estaba firmado.

### Upload de archivo a DANA
```text
POST /dana/conversation/http/rest/file/upload
```

Uso:
- subir el PDF firmado a DANA,
- obtener la referencia final que DANA sí puede usar para adjuntos.

### Trigger de actualización
```text
POST /event/Trigger?dana=...
```

Uso:
- persistir en el registro los campos del acuse firmado.

## Variables de entorno
### Frontend
- `VITE_SUBMIT_SIGNED_ACK_URL`

### Lambda / backend
- `ACK_BUCKET_NAME`
- `ACK_BUCKET_REGION`
- `ALLOWED_ORIGIN`
- `DANA_BASE_URL`
- `DANA_TRIGGER_URL`
- `DANA_USERNAME`
- `DANA_PASSWORD`

## Datos de demo y comportamiento actual
El portal mantiene un mock base para el contenido visual del acuse:

- `src/mocks/ackMock.ts`

Ese mock sigue alimentando el documento base de demo, pero el nombre del firmante puede ser sustituido por el valor real devuelto por DANA cuando el endpoint entrega `record` correctamente.

Hoy el flujo quedó validado para:
- firmar el documento,
- pintar el firmante real en el bloque de firma,
- persistir el acuse,
- subir el adjunto a DANA,
- y disparar el correo con el acuse adjunto.

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
En Amplify Hosting, configurar redirección para SPA:

- Source address: `/<*>`
- Target address: `/index.html`
- Type: `200 (Rewrite)`

## Observaciones operativas
- El endpoint legacy `1.0` de DANA sí es el correcto para este flujo.
- Si DANA no devuelve `record`, el portal no puede poblar datos reales y cae al comportamiento de demo.
- Se validó que los permisos del usuario técnico `integraciondana` sobre la BD/lista de contactos eran críticos para que el `GET` devolviera información útil.
- El correo con adjunto no quedó resuelto usando solo una ruta S3 del bucket propio; fue necesario subir el PDF a DANA y usar la referencia `s3://WS/...`.
