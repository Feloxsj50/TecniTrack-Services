const STORAGE_KEY_SOLICITUDES = "tecnitrackSolicitudes";

const formTecnico = document.getElementById("formTecnico");
const tablaTecnico = document.querySelector("#tablaServicios tbody");
const tecnicoActual = TecniAuth.obtenerSesion()?.usuario || "tecnico";
const panelTrabajo = document.getElementById("panelTrabajo");
const panelBackdrop = document.getElementById("panelTrabajoBackdrop");

function obtenerSolicitudes() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_SOLICITUDES)) || [];
    } catch {
        return [];
    }
}

function guardarSolicitudes(solicitudes) {
    localStorage.setItem(STORAGE_KEY_SOLICITUDES, JSON.stringify(solicitudes));
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function claseEstado(estado) {
    if (estado === "Completado") return "completado";
    if (estado === "En Proceso") return "en-proceso";
    return "pendiente";
}

function clasePrioridad(prioridad) {
    if (prioridad === "Alta") return "prioridad alta";
    if (prioridad === "Baja") return "prioridad baja";
    return "prioridad media";
}

function solicitudesAsignadas() {
    return obtenerSolicitudes().filter(solicitud => solicitud.tecnico === tecnicoActual);
}

function diasAbierto(solicitud) {
    const base = solicitud.creadoEn || solicitud.fecha;
    const inicio = new Date(base);
    if (Number.isNaN(inicio.getTime())) return 0;
    const hoy = new Date();
    const diferencia = hoy.setHours(0, 0, 0, 0) - inicio.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor(diferencia / 86400000));
}

function actualizarCards() {
    const asignadas = solicitudesAsignadas();
    document.getElementById("totalAsignados").textContent = asignadas.length;
    document.getElementById("totalProceso").textContent =
        asignadas.filter(solicitud => solicitud.estado === "En Proceso").length;
    document.getElementById("totalCompletados").textContent =
        asignadas.filter(solicitud => solicitud.estado === "Completado").length;
    document.getElementById("totalPendientes").textContent =
        asignadas.filter(solicitud => solicitud.estado === "Pendiente").length;
}

function renderizarNotificaciones(asignadas) {
    const contenedor = document.getElementById("notificacionesTecnico");
    const activos = asignadas.filter(solicitud => solicitud.estado !== "Completado");
    const urgentes = activos.filter(solicitud => solicitud.prioridad === "Alta");

    if (!activos.length) {
        contenedor.innerHTML = `
            <div class="tech-alert muted">
                <i class="fa-solid fa-circle-check"></i>
                <span>No tenes trabajos pendientes por ahora.</span>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = `
        <div class="tech-alert">
            <i class="fa-solid fa-bell"></i>
            <span>Tenes ${activos.length} trabajo${activos.length === 1 ? "" : "s"} activo${activos.length === 1 ? "" : "s"} asignado${activos.length === 1 ? "" : "s"}.</span>
        </div>
        ${urgentes.length ? `
            <div class="tech-alert urgent">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>${urgentes.length} con prioridad alta.</span>
            </div>
        ` : ""}
    `;
}

function renderizarAsignadas() {
    const asignadas = solicitudesAsignadas();
    tablaTecnico.innerHTML = "";
    actualizarCards();
    renderizarNotificaciones(asignadas);

    if (!asignadas.length) {
        tablaTecnico.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">
                    <div class="empty-state">
                        <i class="fa-solid fa-screwdriver-wrench"></i>
                        <strong>Sin trabajos asignados</strong>
                        <span>Cuando el admin asigne una solicitud a este tecnico, aparecera aqui.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    asignadas.forEach(solicitud => {
        const dias = diasAbierto(solicitud);
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${escaparHtml(solicitud.fecha)}</td>
            <td>${escaparHtml(solicitud.id)}</td>
            <td>${escaparHtml(solicitud.cliente)}</td>
            <td>${escaparHtml(solicitud.dispositivo)}</td>
            <td>${escaparHtml(solicitud.servicio)}</td>
            <td><span class="${clasePrioridad(solicitud.prioridad)}">${escaparHtml(solicitud.prioridad || "Media")}</span></td>
            <td>${dias} ${dias === 1 ? "dia" : "dias"}</td>
            <td><span class="estado ${claseEstado(solicitud.estado)}">${escaparHtml(solicitud.estado)}</span></td>
            <td>
                <button type="button" class="btn-editar-historial" data-trabajo="${solicitud.id}">
                    <i class="fa-solid fa-eye"></i> Ver / Actualizar
                </button>
            </td>
        `;
        tablaTecnico.appendChild(fila);
    });

    tablaTecnico.querySelectorAll("[data-trabajo]").forEach(boton => {
        boton.addEventListener("click", () => abrirPanelTrabajo(boton.dataset.trabajo));
    });
}

function abrirPanelTrabajo(id) {
    const solicitud = obtenerSolicitudes().find(item => item.id === id);
    if (!solicitud) return;

    document.getElementById("idServicioTecnico").value = solicitud.id;
    document.getElementById("diagnosticoTecnico").value = solicitud.diagnostico || "";
    document.getElementById("repuestoTecnico").value = solicitud.repuesto || "";
    document.getElementById("estadoTecnico").value =
        solicitud.estado === "Completado" ? "Completado" : "En Proceso";
    document.getElementById("panelTrabajoId").textContent = solicitud.id;
    document.getElementById("panelTrabajoTitulo").textContent =
        `${solicitud.cliente} - ${solicitud.dispositivo}`;

    panelTrabajo.hidden = false;
    panelBackdrop.hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("diagnosticoTecnico").focus();
}

function cerrarPanelTrabajo() {
    panelTrabajo.hidden = true;
    panelBackdrop.hidden = true;
    document.body.classList.remove("modal-open");
    formTecnico.reset();
}

formTecnico.addEventListener("submit", event => {
    event.preventDefault();

    const id = document.getElementById("idServicioTecnico").value;
    const diagnostico = document.getElementById("diagnosticoTecnico").value.trim();
    const repuesto = document.getElementById("repuestoTecnico").value.trim();
    const estado = document.getElementById("estadoTecnico").value;

    const solicitudes = obtenerSolicitudes().map(solicitud => {
        if (solicitud.id !== id) return solicitud;
        return {
            ...solicitud,
            diagnostico,
            repuesto,
            estado,
            actualizadoEn: new Date().toISOString()
        };
    });

    guardarSolicitudes(solicitudes);
    cerrarPanelTrabajo();
    renderizarAsignadas();
    mostrarNotificacion("Trabajo actualizado correctamente.", "success");
});

document.getElementById("cerrarPanelTrabajo").addEventListener("click", cerrarPanelTrabajo);
panelBackdrop.addEventListener("click", cerrarPanelTrabajo);
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panelTrabajo.hidden) cerrarPanelTrabajo();
});

renderizarAsignadas();
