(function () {
    function obtenerContenedor() {
        let contenedor = document.querySelector(".notification-stack");

        if (!contenedor) {
            contenedor = document.createElement("div");
            contenedor.className = "notification-stack";
            document.body.appendChild(contenedor);
        }

        return contenedor;
    }

    window.mostrarNotificacion = function (mensaje, tipo = "error") {
        const contenedor = obtenerContenedor();
        const notificacion = document.createElement("div");
        const tiempoVisible = tipo === "info" ? 6500 : 4200;
        const textoSeguro = String(mensaje)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;")
            .replace(/\n/g, "<br>");

        notificacion.className = `notification notification-${tipo}`;
        notificacion.innerHTML = `
            <span class="notification-dot"></span>
            <p>${textoSeguro}</p>
            <button type="button" aria-label="Cerrar notificación">&times;</button>
        `;

        const cerrar = () => {
            notificacion.classList.add("notification-hide");
            setTimeout(() => notificacion.remove(), 180);
        };

        notificacion.querySelector("button").addEventListener("click", cerrar);
        contenedor.appendChild(notificacion);
        setTimeout(cerrar, tiempoVisible);
    };

    const mensajePendiente = sessionStorage.getItem("tecnitrackMensaje");
    if (mensajePendiente) {
        sessionStorage.removeItem("tecnitrackMensaje");

        try {
            const { mensaje, tipo } = JSON.parse(mensajePendiente);
            window.mostrarNotificacion(mensaje, tipo);
        } catch {
            // Ignorar mensajes de sesión inválidos.
        }
    }
})();
