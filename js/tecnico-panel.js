const STORAGE_KEY_SOLICITUDES = "tecnitrackSolicitudes";

const formTecnico = document.getElementById("formTecnico");
const tablaTecnico = document.querySelector("#tablaServicios tbody");
const tecnicoActual = TecniAuth.obtenerSesion()?.usuario || "tecnico";

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

function solicitudesAsignadas() {
    return obtenerSolicitudes().filter(solicitud => solicitud.tecnico === tecnicoActual);
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

function renderizarAsignadas() {
    const asignadas = solicitudesAsignadas();
    tablaTecnico.innerHTML = "";
    actualizarCards();

    if (!asignadas.length) {
        tablaTecnico.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">
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
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${escaparHtml(solicitud.fecha)}</td>
            <td>${escaparHtml(solicitud.id)}</td>
            <td>${escaparHtml(solicitud.cliente)}</td>
            <td>${escaparHtml(solicitud.dispositivo)}</td>
            <td>${escaparHtml(solicitud.servicio)}</td>
            <td><span class="estado ${claseEstado(solicitud.estado)}">${escaparHtml(solicitud.estado)}</span></td>
            <td>
                <button type="button" class="btn-editar-historial" data-trabajo="${solicitud.id}">
                    <i class="fa-solid fa-pen"></i> Actualizar
                </button>
            </td>
        `;
        tablaTecnico.appendChild(fila);
    });

    tablaTecnico.querySelectorAll("[data-trabajo]").forEach(boton => {
        boton.addEventListener("click", () => cargarTrabajo(boton.dataset.trabajo));
    });
}

function cargarTrabajo(id) {
    const solicitud = obtenerSolicitudes().find(item => item.id === id);
    if (!solicitud) return;

    document.getElementById("idServicioTecnico").value = solicitud.id;
    document.getElementById("diagnosticoTecnico").value = solicitud.diagnostico || "";
    document.getElementById("repuestoTecnico").value = solicitud.repuesto || "";
    document.getElementById("estadoTecnico").value =
        solicitud.estado === "Completado" ? "Completado" : "En Proceso";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

formTecnico.addEventListener("submit", event => {
    event.preventDefault();

    const id = document.getElementById("idServicioTecnico").value;
    if (!id) {
        mostrarNotificacion("Selecciona un servicio asignado para actualizarlo.", "error");
        return;
    }

    const diagnostico = document.getElementById("diagnosticoTecnico").value.trim();
    const repuesto = document.getElementById("repuestoTecnico").value.trim();
    const estado = document.getElementById("estadoTecnico").value;

    const solicitudes = obtenerSolicitudes().map(solicitud => {
        if (solicitud.id !== id) return solicitud;
        return {
            ...solicitud,
            diagnostico,
            repuesto,
            estado
        };
    });

    guardarSolicitudes(solicitudes);
    formTecnico.reset();
    renderizarAsignadas();
    mostrarNotificacion("Trabajo actualizado correctamente.", "success");
});

renderizarAsignadas();
