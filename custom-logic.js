(function() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* Forzar Fondo y Contenedor */
        body { background-color: #f5f7fa !important; }
        .form-all {
            border-top: 10px solid #005CAB !important;
            border-radius: 16px !important;
            box-shadow: 0 12px 40px rgba(0,0,0,0.1) !important;
            background-color: #ffffff !important;
        }

        /* ELIMINAR AMARILLO: Limpiamos todos los fondos de las líneas */
        .form-line, .form-line-active, .form-input-wide, div[role="main"] div {
            background-color: transparent !important;
            background: none !important;
        }

        /* Inputs Modernos */
        input[type="text"], .form-textbox {
            border: 2px solid #e2e8f0 !important;
            border-radius: 10px !important;
            padding: 12px !important;
        }

        /* TRANSFORMACIÓN DEL BOTÓN (Estilo E-FACTUR) */
        .form-submit-button, #input_submit, button.submit {
            background: #0070C0 !important;
            background: linear-gradient(90deg, #0070C0 0%, #005CAB 100%) !important;
            color: #ffffff !important;
            font-size: 16px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            padding: 16px 40px !important;
            border-radius: 50px !important;
            border: none !important;
            box-shadow: 0 6px 15px rgba(0,92,171,0.4) !important;
            cursor: pointer !important;
            width: 100% !important;
            display: block !important;
            -webkit-appearance: none !important;
        }

        /* Ocultar el campo de la URL larga */
        .form-line:has(input[value*="http"]), 
        div[data-name*="URL"], 
        #id_7 { 
            display: none !important; 
        }

        /* Firma */
        .signature-pad-passive, canvas {
            border: 2px dashed #005CAB !important;
            border-radius: 12px !important;
        }
    `;
    
    // Inyectamos el estilo al final del body para asegurar prioridad
    document.body.appendChild(style);
    console.log("Look & Feel E-FACTUR cargado desde GitHub");
})();
