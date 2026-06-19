(function () {
    let resolverActual = null;

    function crearModal() {
        const modal = document.createElement("div");
        modal.className = "confirm-modal";
        modal.hidden = true;
        modal.innerHTML = `
            <div class="confirm-backdrop"></div>
            <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmTitulo">
                <div class="confirm-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <div class="confirm-copy">
                    <h2 id="confirmTitulo">Confirmar acción</h2>
                    <p id="confirmMensaje">Esta acción no se puede deshacer.</p>
                </div>
                <div class="confirm-actions">
                    <button type="button" class="confirm-cancel">Cancelar</button>
                    <button type="button" class="confirm-delete">
                        <i class="fa-solid fa-trash"></i> Eliminar
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const cerrar = resultado => {
            modal.hidden = true;
            document.body.classList.remove("modal-open");
            if (resolverActual) resolverActual(resultado);
            resolverActual = null;
        };

        modal.querySelector(".confirm-cancel").addEventListener("click", () => cerrar(false));
        modal.querySelector(".confirm-delete").addEventListener("click", () => cerrar(true));
        modal.querySelector(".confirm-backdrop").addEventListener("click", () => cerrar(false));

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && !modal.hidden) cerrar(false);
        });

        return modal;
    }

    window.confirmarAccion = function ({
        titulo = "Confirmar eliminación",
        mensaje = "Esta acción no se puede deshacer.",
        textoConfirmar = "Eliminar"
    } = {}) {
        const modal = document.querySelector(".confirm-modal") || crearModal();
        modal.querySelector("#confirmTitulo").textContent = titulo;
        modal.querySelector("#confirmMensaje").textContent = mensaje;
        modal.querySelector(".confirm-delete").innerHTML = `<i class="fa-solid fa-trash"></i> ${textoConfirmar}`;
        modal.hidden = false;
        document.body.classList.add("modal-open");
        modal.querySelector(".confirm-cancel").focus();

        return new Promise(resolve => {
            resolverActual = resolve;
        });
    };
})();
