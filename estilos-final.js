(function() {
    function aplicarFuerzaBruta() {
        // 1. Inyectar CSS global (Marco azul, quitar fondo amarillo y barra gris)
        if (!document.getElementById('dana-externo')) {
            const style = document.createElement('style');
            style.id = 'dana-externo';
            style.innerHTML = `
                .supernova, .form-header-group { background: #ffffff !important; border: none !important; }
                .form-all { border-top: 10px solid #005CAB !important; background: #ffffff !important; box-shadow: 0 10px 30px rgba(0,0,0,0.1) !important; border-radius: 15px !important; }
                .form-line-active { background: transparent !important; }
                .signature-pad-passive, canvas { border: 2px dashed #005CAB !important; border-radius: 10px !important; }
            `;
            document.head.appendChild(style);
        }

        // 2. Ataque directo al Botón (Javascript Inline Styles le ganan a TODO)
        const btn = document.querySelector('.form-submit-button, button[type="submit"]');
        if (btn) {
            btn.style.setProperty('background', '#005CAB', 'important');
            btn.style.setProperty('background-image', 'none', 'important');
            btn.style.setProperty('color', '#ffffff', 'important');
            btn.style.setProperty('border-radius', '50px', 'important');
            btn.style.setProperty('padding', '16px 30px', 'important');
            btn.style.setProperty('border', 'none', 'important');
            btn.style.setProperty('text-shadow', 'none', 'important');
            btn.style.setProperty('box-shadow', 'none', 'important');
            btn.style.setProperty('-webkit-appearance', 'none', 'important');
        }
    }

    // Ejecutarlo varias veces rápido por si el formulario tarda en aparecer en la pantalla
    let intentos = 0;
    const intervalo = setInterval(() => {
        aplicarFuerzaBruta();
        intentos++;
        if (intentos > 15) clearInterval(intervalo); // Se detiene a los 3 segundos
    }, 200);
})();
