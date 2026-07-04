const STORAGE_KEY_SERVICIOS = "tecnitrackServiciosCliente";

const formSolicitud = document.getElementById("formSolicitud");
const tablaServiciosCliente = document.querySelector("#tablaServicios tbody");

function obtenerServiciosCliente() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_SERVICIOS)) || [];
    } catch {
        return [];
    }
}

function guardarServiciosCliente(servicios) {
    localStorage.setItem(STORAGE_KEY_SERVICIOS, JSON.stringify(servicios));
}

function escaparHtml(valor) {
    return String(valor)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function claseEstadoServicio(estado) {
    if (estado === "Completado") return "completado";
    if (estado === "En Revisión" || estado === "En Proceso") return "en-proceso";
    return "pendiente";
}

function actualizarContadores(servicios) {
    const enRevision = servicios.filter(servicio =>
        servicio.estado === "En Revisión" || servicio.estado === "En Proceso"
    ).length;
    const completados = servicios.filter(servicio => servicio.estado === "Completado").length;

    document.getElementById("totalServicios").textContent = servicios.length;
    document.getElementById("serviciosRevision").textContent = enRevision;
    document.getElementById("serviciosCompletados").textContent = completados;
}

function renderizarServiciosCliente() {
    const servicios = obtenerServiciosCliente();
    actualizarContadores(servicios);
    tablaServiciosCliente.innerHTML = "";

    if (!servicios.length) {
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

    servicios.forEach(servicio => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${escaparHtml(servicio.fecha)}</td>
            <td>${escaparHtml(servicio.id)}</td>
            <td>${escaparHtml(servicio.cliente)}</td>
            <td>${escaparHtml(servicio.dispositivo)}</td>
            <td>${escaparHtml(servicio.servicio)}</td>
            <td><span class="estado ${claseEstadoServicio(servicio.estado)}">${escaparHtml(servicio.estado)}</span></td>
        `;
        tablaServiciosCliente.appendChild(fila);
    });
}

function crearIdServicio(servicios) {
    return `CL-${String(servicios.length + 1).padStart(3, "0")}`;
}

formSolicitud.addEventListener("submit", event => {
    event.preventDefault();

    const servicios = obtenerServiciosCliente();
    const nuevoServicio = {
        id: crearIdServicio(servicios),
        fecha: document.getElementById("fechaSolicitud").value,
        cliente: document.getElementById("nombreCliente").value.trim(),
        dispositivo: document.getElementById("dispositivoCliente").value.trim(),
        servicio: document.getElementById("problemaCliente").value.trim(),
        estado: "Pendiente"
    };

    if (!nuevoServicio.cliente || !nuevoServicio.dispositivo || !nuevoServicio.servicio || !nuevoServicio.fecha) {
        mostrarNotificacion("Completa todos los campos antes de enviar la solicitud.", "error");
        return;
    }

    servicios.unshift(nuevoServicio);
    guardarServiciosCliente(servicios);
    renderizarServiciosCliente();
    formSolicitud.reset();
    mostrarNotificacion("Solicitud enviada. Quedo registrada como pendiente.", "success");
});

renderizarServiciosCliente();
