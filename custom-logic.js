/**
 * DANAConnect Custom UI & Redirect - E-FACTUR
 * Look & Feel: Modern Tech (Blue & Green)
 */

(function() {
    const CONFIG = {
        primaryBlue: '#0070C0',
        accentGreen: '#00DF5D',
        darkGrey: '#2D3748',
        // Cambia esta URL por la página final de la factura o descarga
        redirectUrl: 'https://tu-plataforma.com/descarga-factura' 
    };

    const injectStyles = () => {
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');

            body { font-family: 'Inter', sans-serif; background-color: #f8fafc; }

            /* Contenedor del Formulario */
            form#dana-form, .form-container {
                max-width: 550px !important;
                margin: 40px auto !important;
                padding: 40px !important;
                border-radius: 20px !important;
                background: white !important;
                box-shadow: 0 15px 35px rgba(0, 112, 192, 0.1) !important;
                border-top: 6px solid ${CONFIG.primaryBlue} !important;
            }

            /* Estilo de los Textos */
            h1, h2, label { color: ${CONFIG.darkGrey} !important; font-weight: 700 !important; }

            /* Inputs Personalizados */
            input[type="text"], input[type="email"], select {
                border: 2px solid #E2E8F0 !important;
                border-radius: 10px !important;
                padding: 12px !important;
                transition: all 0.3s ease !important;
            }

            input:focus {
                border-color: ${CONFIG.primaryBlue} !important;
                box-shadow: 0 0 0 4px rgba(0, 112, 192, 0.1) !important;
            }

            /* El Pad de Firma (Handwriting) */
            canvas, .signature-wrapper {
                border: 2px dashed ${CONFIG.primaryBlue} !important;
                background: #F0F9FF !important;
                border-radius: 12px !important;
                cursor: crosshair;
            }

            /* Botón "DESCARGAR" (Estilo similar al del correo) */
            input[type="submit"], .btn-enviar {
                background: linear-gradient(90deg, ${CONFIG.primaryBlue} 0%, #005696 100%) !important;
                color: white !important;
                text-transform: uppercase !important;
                letter-spacing: 1px !important;
                font-weight: bold !important;
                padding: 16px !important;
                border-radius: 50px !important;
                border: none !important;
                cursor: pointer !important;
                box-shadow: 0 4px 15px rgba(0, 112, 192, 0.3) !important;
                transition: transform 0.2s ease !important;
            }

            input[type="submit"]:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0, 112, 192, 0.4) !important;
            }
        `;
        const styleTag = document.createElement("style");
        styleTag.innerHTML = css;
        document.head.appendChild(styleTag);
    };

    const setupRedirect = () => {
        const form = document.querySelector('form');
        
        if (form) {
            form.addEventListener('submit', function(e) {
                // En DANAConnect, a veces el envío es asíncrono. 
                // Esperamos un momento a que se procese la firma y redirigimos.
                console.log("Firma recibida. Redirigiendo a factura...");
                
                setTimeout(() => {
                    window.location.href = CONFIG.redirectUrl;
                }, 2000); 
            });
        }
    };

    // Inicialización
    const init = () => {
        injectStyles();
        setupRedirect();
    };

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);

})();
