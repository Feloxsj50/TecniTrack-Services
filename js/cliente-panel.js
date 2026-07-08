const API_BASE = window.location.origin;

const formSolicitud = document.getElementById("formSolicitud");
const tablaServiciosCliente = document.querySelector("#tablaServicios tbody");
let solicitudesCliente = [];
let csrfToken = "";

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
        return { ok: false, error: "Django devolvio una respuesta no valida." };
    }
}

async function obtenerCsrfToken() {
    if (csrfToken) return csrfToken;

    const respuesta = await fetch(`${API_BASE}/usuarios/csrf/`, { credentials: "include" });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo preparar la seguridad de Django.");

    csrfToken = datos.csrfToken;
    return csrfToken;
}

function claseEstadoServicio(estado) {
    if (estado === "Completado") return "completado";
    if (estado === "En proceso" || estado === "En Proceso") return "en-proceso";
    return "pendiente";
}

function actualizarContadores(solicitudes) {
    const pendientes = solicitudes.filter(solicitud => solicitud.estado === "Pendiente").length;
    const enProceso = solicitudes.filter(solicitud => solicitud.estado === "En proceso" || solicitud.estado === "En Proceso").length;
    const completados = solicitudes.filter(solicitud => solicitud.estado === "Completado").length;

    document.getElementById("totalServicios").textContent = solicitudes.length;
    document.getElementById("serviciosPendientes").textContent = pendientes;
    document.getElementById("serviciosRevision").textContent = enProceso;
    document.getElementById("serviciosCompletados").textContent = completados;
}

function renderizarSolicitudesCliente() {
    actualizarContadores(solicitudesCliente);
    tablaServiciosCliente.innerHTML = "";

    if (!solicitudesCliente.length) {
        tablaServiciosCliente.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fa-solid fa-clipboard-list"></i>
                        <strong>Sin servicios registrados</strong>
                        <span>Cuando solicites o recibas un servicio, aparecerá aquí tu historial.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    solicitudesCliente.forEach(solicitud => {
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

async function cargarSolicitudesCliente() {
    try {
        const respuesta = await fetch(`${API_BASE}/servicios/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudieron cargar tus servicios.");

        solicitudesCliente = datos.solicitudes;
        renderizarSolicitudesCliente();
    } catch (error) {
        solicitudesCliente = [];
        renderizarSolicitudesCliente();
        mostrarNotificacion(error.message || "No se pudieron cargar tus servicios.", "error");
    }
}

async function cargarDatosCliente() {
    try {
        const respuesta = await fetch(`${API_BASE}/usuarios/me/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);
        if (respuesta.ok && datos.ok) {
            const nombre = document.getElementById("nombreCliente");
            nombre.value = datos.usuario.nombre;
            nombre.readOnly = true;
        }
    } catch {
        // El formulario sigue usable si no se puede precargar el nombre.
    }
}

formSolicitud.addEventListener("submit", async event => {
    event.preventDefault();

    const payload = {
        dispositivo: document.getElementById("dispositivoCliente").value.trim(),
        servicio: document.getElementById("problemaCliente").value.trim(),
        fecha: document.getElementById("fechaSolicitud").value,
    };

    if (!payload.dispositivo || !payload.servicio || !payload.fecha) {
        mostrarNotificacion("Completa dispositivo, problema y fecha antes de enviar la solicitud.", "error");
        return;
    }

    try {
        const token = await obtenerCsrfToken();
        const respuesta = await fetch(`${API_BASE}/servicios/crear/`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": token
            },
            body: JSON.stringify(payload)
        });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo enviar la solicitud.");

        formSolicitud.reset();
        await cargarDatosCliente();
        await cargarSolicitudesCliente();
        mostrarNotificacion("Solicitud enviada. El admin la revisará y asignará un técnico.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo enviar la solicitud.", "error");
    }
});

cargarDatosCliente();
cargarSolicitudesCliente();
