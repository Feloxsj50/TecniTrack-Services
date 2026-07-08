const API_BASE = window.location.origin;
let tecnicosDisponibles = [];
let solicitudes = [];
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

function estadoNormalizado(estado) {
    return estado === "En proceso" ? "En Proceso" : estado;
}

function claseEstado(estado) {
    const normalizado = estadoNormalizado(estado);
    if (normalizado === "Completado") return "completado";
    if (normalizado === "En Proceso") return "en-proceso";
    return "pendiente";
}

function clasePrioridad(prioridad) {
    if (prioridad === "Alta") return "prioridad alta";
    if (prioridad === "Baja") return "prioridad baja";
    return "prioridad media";
}

function pintarSelectTecnicos(valorSeleccionado = "") {
    const select = document.getElementById("tecnicoServicio");
    if (!select) return;

    select.innerHTML = `<option value="">Asignar técnico</option>`;

    tecnicosDisponibles.forEach(tecnico => {
        const option = document.createElement("option");
        option.value = tecnico.username;
        option.textContent = tecnico.nombre;
        select.appendChild(option);
    });

    if (valorSeleccionado && !tecnicosDisponibles.some(tecnico => tecnico.username === valorSeleccionado)) {
        const option = document.createElement("option");
        option.value = valorSeleccionado;
        option.textContent = valorSeleccionado;
        select.appendChild(option);
    }

    select.value = valorSeleccionado;
}

async function cargarTecnicosDisponibles() {
    const select = document.getElementById("tecnicoServicio");
    if (select) select.innerHTML = `<option value="">Cargando técnicos...</option>`;

    try {
        const respuesta = await fetch(`${API_BASE}/tecnicos/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudieron cargar los técnicos.");

        tecnicosDisponibles = datos.tecnicos.filter(tecnico => tecnico.estado === "Activo");
        pintarSelectTecnicos();
    } catch (error) {
        tecnicosDisponibles = [];
        if (select) select.innerHTML = `<option value="">Sin técnicos disponibles</option>`;
        mostrarNotificacion(error.message || "No se pudieron cargar los técnicos.", "error");
    }
}

function actualizarCards() {
    const pendientes = solicitudes.filter(s => estadoNormalizado(s.estado) === "Pendiente");
    const proceso = solicitudes.filter(s => estadoNormalizado(s.estado) === "En Proceso");
    const completados = solicitudes.filter(s => estadoNormalizado(s.estado) === "Completado");

    document.getElementById("totalServicios").textContent = solicitudes.length;
    document.getElementById("serviciosPendientes").textContent = pendientes.length;
    document.getElementById("serviciosProceso").textContent = proceso.length;
    document.getElementById("serviciosCompletados").textContent = completados.length;
}

function nombreTecnico(valor) {
    const tecnico = tecnicosDisponibles.find(item => item.username === valor);
    return tecnico ? tecnico.nombre : valor;
}

function cargarServicios() {
    const tabla = document.querySelector("#tablaServicios tbody");
    if (!tabla) return;

    tabla.innerHTML = "";

    if (!solicitudes.length) {
        tabla.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">
                    <div class="empty-state">
                        <i class="fa-solid fa-screwdriver-wrench"></i>
                        <strong>Sin órdenes registradas</strong>
                        <span>Cuando un cliente solicite un servicio o el admin registre una orden presencial, aparecerá aquí.</span>
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
            <td>${escaparHtml(solicitud.tecnico ? nombreTecnico(solicitud.tecnico) : "Sin asignar")}</td>
            <td><span class="${clasePrioridad(solicitud.prioridad)}">${escaparHtml(solicitud.prioridad || "Media")}</span></td>
            <td><span class="estado ${claseEstado(solicitud.estado)}">${escaparHtml(estadoNormalizado(solicitud.estado))}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn-editar-historial" type="button" data-editar="${solicitud.dbId}">
                        <i class="fa-solid fa-pen"></i> Editar
                    </button>
                </div>
            </td>
        `;
        tabla.appendChild(fila);
    });

    tabla.querySelectorAll("[data-editar]").forEach(boton => {
        boton.addEventListener("click", () => editarServicio(Number(boton.dataset.editar)));
    });
}

async function obtenerSolicitudes() {
    const respuesta = await fetch(`${API_BASE}/servicios/`, { credentials: "include" });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudieron cargar las solicitudes.");
    solicitudes = datos.solicitudes;
    cargarServicios();
    actualizarCards();
}

function limpiarFormulario() {
    document.getElementById("idEditar").value = "";
    document.getElementById("cliente").value = "";
    document.getElementById("dispositivo").value = "";
    document.getElementById("servicio").value = "";
    document.getElementById("fecha").value = "";
    pintarSelectTecnicos();
    document.getElementById("prioridadServicio").value = "Media";
    document.getElementById("estadoServicio").value = "Pendiente";
    document.getElementById("tituloFormulario").textContent = "Registrar Servicio Presencial";
    document.getElementById("btnGuardar").textContent = "Guardar Orden";
}

function editarServicio(dbId) {
    const solicitud = solicitudes.find(item => item.dbId === dbId);
    if (!solicitud) return;

    document.getElementById("idEditar").value = solicitud.dbId;
    document.getElementById("cliente").value = solicitud.usuarioCliente;
    document.getElementById("dispositivo").value = solicitud.dispositivo;
    document.getElementById("servicio").value = solicitud.servicio;
    document.getElementById("fecha").value = solicitud.fecha;
    pintarSelectTecnicos(solicitud.tecnico || "");
    document.getElementById("prioridadServicio").value = solicitud.prioridad || "Media";
    document.getElementById("estadoServicio").value = estadoNormalizado(solicitud.estado);
    document.getElementById("tituloFormulario").textContent = "Asignar o Actualizar Orden";
    document.getElementById("btnGuardar").textContent = "Actualizar Orden";

    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("btnGuardar")?.addEventListener("click", async () => {
    const idEditar = document.getElementById("idEditar").value;
    const payload = {
        cliente: document.getElementById("cliente").value.trim(),
        dispositivo: document.getElementById("dispositivo").value.trim(),
        servicio: document.getElementById("servicio").value.trim(),
        fecha: document.getElementById("fecha").value,
        tecnico: document.getElementById("tecnicoServicio").value,
        prioridad: document.getElementById("prioridadServicio").value,
        estado: document.getElementById("estadoServicio").value,
    };

    if (!payload.cliente || !payload.dispositivo || !payload.servicio || !payload.fecha) {
        mostrarNotificacion("Completa cliente, dispositivo, servicio y fecha.", "error");
        return;
    }

    try {
        const token = await obtenerCsrfToken();
        const url = idEditar ? `${API_BASE}/servicios/${idEditar}/actualizar/` : `${API_BASE}/servicios/crear/`;
        const respuesta = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": token
            },
            body: JSON.stringify(payload)
        });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo guardar la orden.");

        mostrarNotificacion(idEditar ? "Orden actualizada correctamente." : "Orden creada correctamente.", "success");
        limpiarFormulario();
        await obtenerSolicitudes();
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo guardar la orden.", "error");
    }
});

async function iniciarDashboardAdmin() {
    await cargarTecnicosDisponibles();
    await obtenerSolicitudes();
}

iniciarDashboardAdmin();
