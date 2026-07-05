const STORAGE_KEY_SOLICITUDES = "tecnitrackSolicitudes";
const tecnicoActual = TecniAuth.obtenerSesion()?.usuario || "tecnico";
const tbodyTrabajos = document.querySelector("#tablaServicios tbody");

function obtenerSolicitudes() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_SOLICITUDES)) || [];
    } catch {
        return [];
    }
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function clasePrioridad(prioridad) {
    if (prioridad === "Alta") return "prioridad alta";
    if (prioridad === "Baja") return "prioridad baja";
    return "prioridad media";
}

function trabajosCompletados() {
    return obtenerSolicitudes().filter(solicitud =>
        solicitud.tecnico === tecnicoActual && solicitud.estado === "Completado"
    );
}

function actualizarResumen(trabajos) {
    const mesActual = new Date().toISOString().slice(0, 7);
    document.getElementById("historialTotal").textContent = trabajos.length;
    document.getElementById("historialMes").textContent =
        trabajos.filter(trabajo => (trabajo.actualizadoEn || trabajo.fecha || "").startsWith(mesActual)).length;
    document.getElementById("historialAlta").textContent =
        trabajos.filter(trabajo => trabajo.prioridad === "Alta").length;
    document.getElementById("historialRepuestos").textContent =
        trabajos.filter(trabajo => trabajo.repuesto).length;
}

function renderizarTrabajos() {
    const trabajos = trabajosCompletados();
    actualizarResumen(trabajos);

    if (!trabajos.length) {
        tbodyTrabajos.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fa-solid fa-clipboard-check"></i>
                        <strong>Sin trabajos completados</strong>
                        <span>Cuando marques un servicio como completado, aparecera aqui.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbodyTrabajos.innerHTML = trabajos.map(trabajo => `
        <tr>
            <td>${escaparHtml(trabajo.fecha)}</td>
            <td>${escaparHtml(trabajo.id)}</td>
            <td>${escaparHtml(trabajo.cliente)}</td>
            <td>${escaparHtml(trabajo.dispositivo)}</td>
            <td>${escaparHtml(trabajo.servicio)}</td>
            <td><span class="${clasePrioridad(trabajo.prioridad)}">${escaparHtml(trabajo.prioridad || "Media")}</span></td>
            <td>${escaparHtml(trabajo.repuesto || "Sin repuesto")}</td>
            <td><span class="estado completado">Completado</span></td>
        </tr>
    `).join("");
}

renderizarTrabajos();
