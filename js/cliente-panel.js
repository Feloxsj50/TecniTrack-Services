const STORAGE_KEY_SOLICITUDES = "tecnitrackSolicitudes";

const formSolicitud = document.getElementById("formSolicitud");
const tablaServiciosCliente = document.querySelector("#tablaServicios tbody");
const usuarioCliente = TecniAuth.obtenerSesion()?.usuario || "cliente";

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

function claseEstadoServicio(estado) {
    if (estado === "Completado") return "completado";
    if (estado === "En Proceso") return "en-proceso";
    return "pendiente";
}

function actualizarContadores(solicitudes) {
    const pendientes = solicitudes.filter(solicitud => solicitud.estado === "Pendiente").length;
    const enProceso = solicitudes.filter(solicitud => solicitud.estado === "En Proceso").length;
    const completados = solicitudes.filter(solicitud => solicitud.estado === "Completado").length;

    document.getElementById("totalServicios").textContent = solicitudes.length;
    document.getElementById("serviciosPendientes").textContent = pendientes;
    document.getElementById("serviciosRevision").textContent = enProceso;
    document.getElementById("serviciosCompletados").textContent = completados;
}

function renderizarSolicitudesCliente() {
    const solicitudes = obtenerSolicitudes().filter(solicitud => solicitud.usuarioCliente === usuarioCliente);
    actualizarContadores(solicitudes);
    tablaServiciosCliente.innerHTML = "";

    if (!solicitudes.length) {
        tablaServiciosCliente.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fa-solid fa-clipboard-list"></i>
                        <strong>Sin servicios registrados</strong>
                        <span>Cuando el cliente solicite o reciba un servicio, aparecerá aquí su historial.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    solicitudes.forEach(solicitud => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${escaparHtml(solicitud.fecha)}</td>
            <td>${escaparHtml(solicitud.id)}</td>
            <td>${escaparHtml(solicitud.cliente)}</td>
            <td>${escaparHtml(solicitud.dispositivo)}</td>
            <td>${escaparHtml(solicitud.servicio)}</td>
            <td><span class="estado ${claseEstadoServicio(solicitud.estado)}">${escaparHtml(solicitud.estado)}</span></td>
        `;
        tablaServiciosCliente.appendChild(fila);
    });
}

function crearIdSolicitud(solicitudes) {
    return `SOL-${String(solicitudes.length + 1).padStart(3, "0")}`;
}

formSolicitud.addEventListener("submit", event => {
    event.preventDefault();

    const solicitudes = obtenerSolicitudes();
    const nuevaSolicitud = {
        id: crearIdSolicitud(solicitudes),
        fecha: document.getElementById("fechaSolicitud").value,
        cliente: document.getElementById("nombreCliente").value.trim(),
        dispositivo: document.getElementById("dispositivoCliente").value.trim(),
        servicio: document.getElementById("problemaCliente").value.trim(),
        tecnico: "",
        diagnostico: "",
        repuesto: "",
        usuarioCliente,
        prioridad: "Media",
        estado: "Pendiente",
        creadoEn: new Date().toISOString()
    };

    if (!nuevaSolicitud.cliente || !nuevaSolicitud.dispositivo || !nuevaSolicitud.servicio || !nuevaSolicitud.fecha) {
        mostrarNotificacion("Completa todos los campos antes de enviar la solicitud.", "error");
        return;
    }

    solicitudes.unshift(nuevaSolicitud);
    guardarSolicitudes(solicitudes);
    renderizarSolicitudesCliente();
    formSolicitud.reset();
    mostrarNotificacion("Solicitud enviada. El admin la revisara y asignara un tecnico.", "success");
});

renderizarSolicitudesCliente();
