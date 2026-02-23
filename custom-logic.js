/**
 * DANAConnect Custom UI & Redirect - E-FACTUR
 * Look & Feel basado en el correo de Soluciones Laser
 */

(function() {
    // Configuración de Colores y Link
    const CONFIG = {
        primaryBlue: '#005CAB', // Azul del botón descargar
        accentGreen: '#00DF5D', // Verde E-FACTUR
        invoiceUrl: 'https://wsqa.solucioneslaser.com/pruebapdf-war/recursos/services/generar/flbzlgUTxUphYyRhGjRMuA=='
    };

    const injectStyles = () => {
        const css = `
            /* Estilo General del Formulario */
            body { background-color: #f4f7f9 !important; font-family: sans-serif; }
            
            form {
                max-width: 500px !important;
                margin: 30px auto !important;
                padding: 30px !important;
                background: #ffffff !important;
                border-radius: 15px !important;
                box-shadow: 0 8px 25px rgba(0,0,0,0.1) !important;
                border-top: 8px solid ${CONFIG.primaryBlue} !important;
            }

            /* Estilo del Pad de Firma */
            canvas, .signature-pad {
                border: 2px dashed ${CONFIG.primaryBlue} !important;
                border-radius: 10px !important;
                background: #fafafa !important;
            }

            /* Botón Enviar con estilo del correo */
            input[type="submit"], .btn-enviar, #btnSubmit {
                background: linear-gradient(180deg, #1e88e5 0%, ${CONFIG.primaryBlue} 100%) !important;
                color: white !important;
                border: none !important;
                padding: 15px 25px !important;
                border-radius: 30px !important;
                font-weight: bold !important;
                text-transform: uppercase !important;
                cursor: pointer !important;
                width: 100% !important;
                box-shadow: 0 4px 10px rgba(0,92,171,0.3) !important;
                transition: all 0.3s ease;
            }

            input[type="submit"]:hover {
                transform: scale(1.02);
                box-shadow: 0 6px 15px rgba(0,92,171,0.4) !important;
            }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.innerText = css;
        document.head.appendChild(styleSheet);
    };

    const handleRedirect = () => {
        // Buscamos el formulario de DANA
        const form = document.querySelector('form');
        if (form) {
            form.addEventListener('submit', function() {
                // Al firmar y enviar, esperamos 1.5 segundos y redirigimos al PDF
                setTimeout(() => {
                    window.location.href = CONFIG.invoiceUrl;
                }, 1500);
            });
        }
    };

    // Ejecución
    if (document.readyState === 'complete') {
        injectStyles();
        handleRedirect();
    } else {
        window.addEventListener('load', () => {
            injectStyles();
            handleRedirect();
        });
    }
})();
