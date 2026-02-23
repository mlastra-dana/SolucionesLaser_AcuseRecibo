/**
 * DANAConnect Custom UI & Dynamic Redirect
 * Cliente: Soluciones Laser - E-FACTUR
 */

(function() {
    const injectStyles = () => {
        const css = `
            /* Contenedor Principal */
            .form-all, form {
                font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
                background: #ffffff !important;
                border-radius: 12px !important;
                box-shadow: 0 10px 25px rgba(0,92,171,0.1) !important;
                border-top: 8px solid #005CAB !important;
                padding: 25px !important;
            }

            /* Estilo para los Labels y Títulos */
            .form-label, h1, h2 { color: #2D3748 !important; font-weight: 600 !important; }

            /* Inputs (Número de Factura y URL) */
            input[type="text"] {
                border: 2px solid #E2E8F0 !important;
                border-radius: 8px !important;
                padding: 10px !important;
                background-color: #F7FAFC !important;
            }

            /* Signature Pad (El recuadro de firma) */
            .signature-pad-passive, canvas {
                border: 2px dashed #005CAB !important;
                background: #F0F9FF !important;
                border-radius: 10px !important;
            }

            /* Botón Enviar (Estilo E-FACTUR) */
            .form-submit-button, button#input_submit {
                background: linear-gradient(90deg, #0070C0 0%, #005CAB 100%) !important;
                color: white !important;
                border-radius: 50px !important;
                padding: 14px 40px !important;
                font-weight: bold !important;
                border: none !important;
                cursor: pointer !important;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0,112,192,0.3) !important;
            }

            .form-submit-button:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,112,192,0.4) !important; }
        `;
        const style = document.createElement('style');
        style.innerHTML = css;
        document.head.appendChild(style);
    };

    const setupLogic = () => {
        // Buscamos el formulario
        const form = document.querySelector('form');
        
        // Buscamos el valor del campo URL Factura dinámicamente
        // En DANA, estos campos suelen tener IDs específicos o nombres
        const getInvoiceUrl = () => {
            // Intentamos obtener el valor del input que contiene la URL
            const urlInput = document.querySelector('input[value*="http"]');
            return urlInput ? urlInput.value : 'https://wsqa.solucioneslaser.com/pruebapdf-war/recursos/services/generar/flbzlgUTxUphYyRhGjRMuA==';
        };

        if (form) {
            form.addEventListener('submit', function() {
                const destination = getInvoiceUrl();
                console.log("Firma enviada. Redirigiendo a:", destination);
                
                setTimeout(() => {
                    window.location.href = destination;
                }, 1500);
            });
        }
    };

    if (document.readyState === 'complete') { injectStyles(); setupLogic(); }
    else { window.addEventListener('load', () => { injectStyles(); setupLogic(); }); }
})();
