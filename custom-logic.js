(function() {
    function inyectarEstilosPro() {
        // Evitar que se inyecte dos veces
        if (document.getElementById('dana-estilos-pro')) return;

        const style = document.createElement('style');
        style.id = 'dana-estilos-pro';
        style.innerHTML = `
            /* Matar la barra gris espantosa */
            .form-header-group, .supernova { 
                background: #ffffff !important; 
                border: none !important; 
            }

            /* Contenedor principal estilo SaaS */
            .form-all {
                border-top: 10px solid #005CAB !important;
                border-radius: 20px !important;
                box-shadow: 0 15px 35px rgba(0, 92, 171, 0.08) !important;
                background-color: #ffffff !important;
                padding: 40px !important;
                font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
            }

            /* Matar el amarillo de los campos */
            .form-line-active, .form-line { background-color: transparent !important; }

            /* Cajas de texto redondeadas y modernas */
            .form-textbox {
                border: 2px solid #e2e8f0 !important;
                border-radius: 12px !important;
                padding: 14px 16px !important;
                background-color: #f8fafc !important;
                width: 100% !important;
                box-sizing: border-box !important;
                transition: all 0.3s ease !important;
            }
            
            .form-textbox:focus {
                border-color: #005CAB !important;
                background-color: #ffffff !important;
                outline: none !important;
            }

            /* Pad de Firma */
            .signature-pad-passive, canvas {
                border: 2px dashed #005CAB !important;
                border-radius: 12px !important;
                background-color: #f8fbff !important;
            }

            /* EL BOTÓN PRO DE SOLUCIONES LASER */
            .form-submit-button, button[type="submit"] {
                background: #0070C0 !important;
                background-image: linear-gradient(90deg, #0070C0 0%, #005CAB 100%) !important;
                color: #ffffff !important;
                font-size: 16px !important;
                font-weight: bold !important;
                text-transform: uppercase !important;
                padding: 18px !important;
                border-radius: 50px !important;
                border: none !important;
                width: 100% !important;
                cursor: pointer !important;
                box-shadow: 0 8px 20px rgba(0, 92, 171, 0.2) !important;
                -webkit-appearance: none !important;
                margin-top: 20px !important;
            }

            .form-submit-button:hover {
                transform: translateY(-2px) !important;
                box-shadow: 0 10px 25px rgba(0, 92, 171, 0.3) !important;
            }
        `;
        document.body.appendChild(style);
    }

    // Ejecutamos la inyección al instante, y repetimos 1 segundo después 
    // por si DANAConnect se tarda en cargar el formulario interno
    inyectarEstilosPro();
    window.addEventListener('load', inyectarEstilosPro);
    setTimeout(inyectarEstilosPro, 1200);
})();
