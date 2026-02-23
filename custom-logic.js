(function() {
    const applyStyles = () => {
        // 1. Inyectar CSS global con máxima prioridad
        const style = document.createElement('style');
        style.innerHTML = `
            .form-all { border-top: 10px solid #005CAB !important; border-radius: 16px !important; box-shadow: 0 12px 40px rgba(0,0,0,0.15) !important; }
            .form-line-active, .form-line { background-color: transparent !important; background: none !important; }
            #input_submit, .form-submit-button {
                background: linear-gradient(90deg, #0070C0 0%, #005CAB 100%) !important;
                color: white !important;
                border-radius: 50px !important;
                padding: 15px 40px !important;
                font-weight: bold !important;
                text-transform: uppercase !important;
                border: none !important;
                cursor: pointer !important;
                box-shadow: 0 6px 15px rgba(0,92,171,0.4) !important;
                display: block !important;
                width: 100% !important;
            }
            .signature-pad-passive, canvas { border: 2px dashed #005CAB !important; border-radius: 12px !important; }
            /* Ocultar campo de URL larga */
            .form-line:has(input[value*="http"]), div[data-name*="Link"] { display: none !important; }
        `;
        document.head.appendChild(style);

        // 2. Forzar cambios directos en elementos (Fuerza Bruta)
        const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], .form-submit-button');
        if (submitBtn) {
            submitBtn.style.background = "linear-gradient(90deg, #0070C0 0%, #005CAB 100%)";
            submitBtn.style.color = "white";
            submitBtn.value = "DESCARGAR FACTURA";
            submitBtn.innerHTML = "DESCARGAR FACTURA";
        }

        // Remover fondos amarillos de las líneas
        document.querySelectorAll('.form-line').forEach(line => {
            line.style.backgroundColor = "transparent";
        });
    };

    // Ejecutar inmediatamente y re-intentar a los 2 segundos por si DANA tarda en cargar
    if (document.readyState === 'complete') {
        applyStyles();
    } else {
        window.addEventListener('load', applyStyles);
    }
    setTimeout(applyStyles, 2000); 
})();
