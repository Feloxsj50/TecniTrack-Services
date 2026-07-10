const API_BASE = (() => {
    const origin = window.location.origin;
    const localStaticPorts = ["5500", "5501", "5173"];

    if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
    if (localStaticPorts.includes(window.location.port)) {
        return window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
    }

    return origin;
})();

const formSolicitud = document.getElementById("formSolicitud");
const tablaServiciosCliente = document.querySelector("#tablaServicios tbody");
const panelServicio = document.getElementById("panelServicioCliente");
const panelBackdrop = document.getElementById("panelServicioBackdrop");
const filtrosCliente = { estado: "Todos", busqueda: "" };
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
        return { ok: false, error: "Django devolvi\u00f3 una respuesta no v\u00e1lida." };
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

function estadoNormalizado(estado) {
    return estado === "En proceso" ? "En Proceso" : estado;
}

function claseEstadoServicio(estado) {
    const normalizado = estadoNormalizado(estado);
    if (normalizado === "Completado") return "completado";
    if (normalizado === "En Proceso") return "en-proceso";
    return "pendiente";
}

function pesoEstadoCliente(estado) {
    const normalizado = estadoNormalizado(estado);
    if (normalizado === "En Proceso") return 3;
    if (normalizado === "Pendiente") return 2;
    return 1;
}

function fechaOrdenable(solicitud) {
    return new Date(solicitud.creadoEn || solicitud.fecha || 0).getTime() || 0;
}

function ordenarSolicitudes(lista) {
    return lista.slice().sort((a, b) => {
        const estado = pesoEstadoCliente(b.estado) - pesoEstadoCliente(a.estado);
        if (estado) return estado;
        return fechaOrdenable(b) - fechaOrdenable(a);
    });
}

function solicitudesActivas() {
    return solicitudesCliente.filter(solicitud => estadoNormalizado(solicitud.estado) !== "Completado");
}

function solicitudesFiltradas() {
    const texto = filtrosCliente.busqueda.trim().toLowerCase();

    return ordenarSolicitudes(solicitudesCliente).filter(solicitud => {
        const estado = estadoNormalizado(solicitud.estado);
        const coincideEstado = filtrosCliente.estado === "Todos" || estado === filtrosCliente.estado;
        const coincideBusqueda = !texto || [
            solicitud.id,
            solicitud.dispositivo,
            solicitud.servicio,
            solicitud.tecnicoNombre
        ].some(valor => String(valor || "").toLowerCase().includes(texto));

        return coincideEstado && coincideBusqueda;
    });
}

function actualizarContadores(solicitudes) {
    const pendientes = solicitudes.filter(solicitud => estadoNormalizado(solicitud.estado) === "Pendiente").length;
    const enProceso = solicitudes.filter(solicitud => estadoNormalizado(solicitud.estado) === "En Proceso").length;
    const completados = solicitudes.filter(solicitud => estadoNormalizado(solicitud.estado) === "Completado").length;

    document.getElementById("totalServicios").textContent = solicitudes.length;
    document.getElementById("serviciosPendientes").textContent = pendientes;
    document.getElementById("serviciosRevision").textContent = enProceso;
    document.getElementById("serviciosCompletados").textContent = completados;
}

function actualizarContadorServicios(total) {
    const contador = document.getElementById("contadorServiciosCliente");
    if (!contador) return;
    contador.textContent = `${total} ${total === 1 ? "servicio" : "servicios"}`;
}

function renderizarServicioActual() {
    const actual = ordenarSolicitudes(solicitudesActivas())[0];
    const titulo = document.getElementById("servicioActualTitulo");
    const detalle = document.getElementById("servicioActualDetalle");
    const boton = document.getElementById("btnServicioActual");

    if (!actual) {
        titulo.textContent = "Sin solicitudes activas";
        detalle.textContent = "Cuando env\u00edes una solicitud, podr\u00e1s seguir aqu\u00ed el estado de tu equipo.";
        boton.disabled = true;
        boton.onclick = null;
        return;
    }

    titulo.textContent = `${actual.dispositivo} - ${actual.servicio}`;
    detalle.textContent = `${actual.id} - ${estadoNormalizado(actual.estado)} - T\u00e9cnico: ${actual.tecnicoNombre || "Por asignar"}`;
    boton.disabled = false;
    boton.onclick = () => abrirDetalleServicio(actual.dbId);
}

function renderizarSolicitudesCliente() {
    actualizarContadores(solicitudesCliente);
    renderizarServicioActual();
    tablaServiciosCliente.innerHTML = "";

    const visibles = solicitudesFiltradas();
    actualizarContadorServicios(visibles.length);

    if (!visibles.length) {
        tablaServiciosCliente.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">
                    <div class="empty-state">
                        <i class="fa-solid fa-clipboard-list"></i>
                        <strong>Sin servicios para mostrar</strong>
                        <span>Cuando solicites o recibas un servicio, aparecer\u00e1 aqu\u00ed tu historial.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    visibles.forEach(solicitud => {
        const estado = estadoNormalizado(solicitud.estado);
        const puedeVerRecibo = estado === "Completado" && solicitud.facturada;
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${escaparHtml(solicitud.fecha || "-")}</td>
            <td>${escaparHtml(solicitud.id)}</td>
            <td>${escaparHtml(solicitud.dispositivo)}</td>
            <td>${escaparHtml(solicitud.servicio)}</td>
            <td>${escaparHtml(solicitud.tecnicoNombre || "Por asignar")}</td>
            <td><span class="estado ${claseEstadoServicio(solicitud.estado)}">${escaparHtml(estado)}</span></td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-editar-historial" data-servicio="${solicitud.dbId}">
                        <i class="fa-solid fa-eye"></i> Ver
                    </button>
                    ${puedeVerRecibo ? `
                        <button type="button" class="btn-facturar-orden" data-recibos>
                            <i class="fa-solid fa-receipt"></i> Recibo
                        </button>
                    ` : ""}
                </div>
            </td>
        `;
        tablaServiciosCliente.appendChild(fila);
    });

    tablaServiciosCliente.querySelectorAll("[data-servicio]").forEach(boton => {
        boton.addEventListener("click", () => abrirDetalleServicio(Number(boton.dataset.servicio)));
    });

    tablaServiciosCliente.querySelectorAll("[data-recibos]").forEach(boton => {
        boton.addEventListener("click", () => {
            window.location.href = "mis-pagos.html";
        });
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

function renderizarPasosEstado(solicitud) {
    const estado = estadoNormalizado(solicitud.estado);
    const pasos = [
        { estado: "Pendiente", texto: "Solicitud recibida" },
        { estado: "En Proceso", texto: "En revisi\u00f3n" },
        { estado: "Completado", texto: "Servicio completado" }
    ];
    const indiceActual = pasos.findIndex(paso => paso.estado === estado);

    document.getElementById("estadoServicioPasos").innerHTML = pasos.map((paso, index) => `
        <div class="client-step ${index <= indiceActual ? "active" : ""}">
            <span>${index + 1}</span>
            <strong>${escaparHtml(paso.texto)}</strong>
        </div>
    `).join("");
}

function abrirDetalleServicio(dbId) {
    const solicitud = solicitudesCliente.find(item => item.dbId === dbId);
    if (!solicitud) return;

    const estado = estadoNormalizado(solicitud.estado);
    document.getElementById("panelServicioId").textContent = solicitud.id;
    document.getElementById("panelServicioTitulo").textContent = `${solicitud.dispositivo} - ${solicitud.servicio}`;
    renderizarPasosEstado(solicitud);

    document.getElementById("panelServicioMeta").innerHTML = `
        <div><span>Fecha preferida</span><strong>${escaparHtml(solicitud.fecha || "-")}</strong></div>
        <div><span>T\u00e9cnico</span><strong>${escaparHtml(solicitud.tecnicoNombre || "Por asignar")}</strong></div>
        <div><span>Estado</span><strong>${escaparHtml(estado)}</strong></div>
        <div><span>Recibo</span><strong>${solicitud.facturada ? "Disponible" : "A\u00fan no emitido"}</strong></div>
    `;

    const diagnostico = solicitud.diagnostico
        ? `<p><span>Diagn\u00f3stico</span><strong>${escaparHtml(solicitud.diagnostico)}</strong></p>`
        : `<p><span>Diagn\u00f3stico</span><strong>El t\u00e9cnico a\u00fan no ha registrado un diagn\u00f3stico.</strong></p>`;
    const repuesto = solicitud.repuesto
        ? `<p><span>Repuesto</span><strong>${escaparHtml(solicitud.repuesto)}</strong></p>`
        : `<p><span>Repuesto</span><strong>Sin repuesto registrado.</strong></p>`;
    const recibo = solicitud.facturada
        ? `<button type="button" class="btn-facturar-orden" id="btnVerReciboDetalle"><i class="fa-solid fa-receipt"></i> Ver recibo</button>`
        : "";

    document.getElementById("panelServicioDiagnostico").innerHTML = `${diagnostico}${repuesto}${recibo}`;
    document.getElementById("btnVerReciboDetalle")?.addEventListener("click", () => {
        window.location.href = "mis-pagos.html";
    });

    panelServicio.hidden = false;
    panelBackdrop.hidden = false;
    document.body.classList.add("modal-open");
}

function cerrarDetalleServicio() {
    panelServicio.hidden = true;
    panelBackdrop.hidden = true;
    document.body.classList.remove("modal-open");
}

function conectarFiltrosCliente() {
    const filtroEstado = document.getElementById("filtroEstadoCliente");
    const buscar = document.getElementById("buscarServicioCliente");

    filtroEstado?.addEventListener("change", () => {
        filtrosCliente.estado = filtroEstado.value;
        renderizarSolicitudesCliente();
    });

    buscar?.addEventListener("input", () => {
        filtrosCliente.busqueda = buscar.value;
        renderizarSolicitudesCliente();
    });
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

    if (payload.dispositivo.length < 2 || payload.servicio.length < 4) {
        mostrarNotificacion("Describe mejor el dispositivo y el problema para que el taller pueda revisarlo.", "error");
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
        mostrarNotificacion("Solicitud enviada. El admin la revisar\u00e1 y asignar\u00e1 un t\u00e9cnico.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo enviar la solicitud.", "error");
    }
});

function iniciarPanelCliente() {
    conectarFiltrosCliente();
    document.getElementById("cerrarPanelServicio").addEventListener("click", cerrarDetalleServicio);
    panelBackdrop.addEventListener("click", cerrarDetalleServicio);
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panelServicio.hidden) cerrarDetalleServicio();
    });
    cargarDatosCliente();
    cargarSolicitudesCliente();
}

iniciarPanelCliente();


