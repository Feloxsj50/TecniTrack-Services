const API_BASE = (() => {
    const origin = window.location.origin;
    const localStaticPorts = ["5500", "5501", "5173"];

    if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
    if (localStaticPorts.includes(window.location.port)) {
        return window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
    }

    return origin;
})();
const tbodyTrabajos = document.querySelector("#tablaServicios tbody");
let paginaTrabajos = 1;

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function leerRespuestaJson(respuesta) {
    const texto = await respuesta.text();
    try {
        return JSON.parse(texto);
    } catch {
        return { ok: false, error: "Django devolvió una respuesta no válida." };
    }
}

function clasePrioridad(prioridad) {
    if (prioridad === "Alta") return "prioridad alta";
    if (prioridad === "Baja") return "prioridad baja";
    return "prioridad media";
}

function trabajosCompletados(solicitudes) {
    return solicitudes.filter(solicitud => solicitud.estado === "Completado");
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

function renderizarTrabajos(trabajos) {
    actualizarResumen(trabajos);

    if (!trabajos.length) {
        tbodyTrabajos.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fa-solid fa-clipboard-check"></i>
                        <strong>Sin trabajos completados</strong>
                        <span>Cuando marques un servicio como completado, aparecerá aquí.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbodyTrabajos.innerHTML = obtenerPagina(trabajos, paginaTrabajos).map(trabajo => `
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
    renderizarPaginacion("paginacionTrabajos", trabajos.length, paginaTrabajos, pagina => {
        paginaTrabajos = pagina;
        renderizarTrabajos(trabajos);
    });
}

async function cargarMisTrabajos() {
    try {
        const respuesta = await fetch(`${API_BASE}/servicios/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudieron cargar tus trabajos.");
        renderizarTrabajos(trabajosCompletados(datos.solicitudes || []));
    } catch (error) {
        actualizarResumen([]);
        tbodyTrabajos.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <strong>No se pudieron cargar tus trabajos</strong>
                        <span>${escaparHtml(error.message || "Verifica que Django esté activo.")}</span>
                    </div>
                </td>
            </tr>
        `;
    }
}

cargarMisTrabajos();
