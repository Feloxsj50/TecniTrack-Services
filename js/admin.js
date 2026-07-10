const API_BASE = (() => {
    const origin = window.location.origin;
    const localStaticPorts = ["5500", "5501", "5173"];

    if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
    if (localStaticPorts.includes(window.location.port)) {
        return window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
    }

    return origin;
})();
let tecnicosDisponibles = [];
let clientesDisponibles = [];
let solicitudes = [];
let csrfToken = "";
let clienteSeleccionado = null;
const filtrosOrdenes = { estado: "Todos", prioridad: "Todas", busqueda: "" };

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
        return { ok: false, error: "Django devolviÃ³ una respuesta no vÃ¡lida." };
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

function pintarDatalistClientes(filtro = "") {
    const contenedor = document.getElementById("clientesServicioList");
    if (!contenedor) return;

    const texto = filtro.trim().toLowerCase();
    if (texto.length < 1) {
        contenedor.innerHTML = "";
        contenedor.hidden = true;
        return;
    }

    const clientesFiltrados = clientesDisponibles.filter(cliente =>
        cliente.nombre.toLowerCase().includes(texto) ||
        cliente.usuario.toLowerCase().includes(texto) ||
        cliente.correo.toLowerCase().includes(texto)
    ).slice(0, 6);

    contenedor.innerHTML = "";

    if (!clientesFiltrados.length) {
        contenedor.hidden = true;
        return;
    }

    clientesFiltrados.forEach(cliente => {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "client-suggestion";
        boton.innerHTML = `
            <strong>${escaparHtml(cliente.nombre)}</strong>
            <span>@${escaparHtml(cliente.usuario)} - ${escaparHtml(cliente.correo)}${cliente.telefono ? ` - ${escaparHtml(cliente.telefono)}` : ""}</span>
        `;
        boton.addEventListener("click", () => {
            clienteSeleccionado = cliente;
            document.getElementById("cliente").value = `${cliente.nombre} (@${cliente.usuario})`;
            contenedor.hidden = true;
        });
        contenedor.appendChild(boton);
    });

    contenedor.hidden = false;
}

async function cargarClientesDisponibles() {
    try {
        const respuesta = await fetch(`${API_BASE}/clientes/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudieron cargar los clientes.");

        clientesDisponibles = datos.clientes.filter(cliente => cliente.estado === "Activo");
    } catch (error) {
        clientesDisponibles = [];
        mostrarNotificacion(error.message || "No se pudieron cargar los clientes.", "error");
    }
}

function resolverClienteFormulario(valor) {
    const texto = valor.trim().toLowerCase();
    const usuarioEnTexto = valor.match(/@([A-Za-z0-9._-]{4,30})/);

    if (clienteSeleccionado && (
        texto === clienteSeleccionado.usuario.toLowerCase() ||
        texto === clienteSeleccionado.nombre.toLowerCase() ||
        texto === `${clienteSeleccionado.nombre} (@${clienteSeleccionado.usuario})`.toLowerCase()
    )) {
        return { valor: clienteSeleccionado.usuario, clienteId: clienteSeleccionado.id };
    }

    if (usuarioEnTexto) {
        const clientePorUsuario = clientesDisponibles.find(item => item.usuario.toLowerCase() === usuarioEnTexto[1].toLowerCase());
        if (clientePorUsuario) return { valor: clientePorUsuario.usuario, clienteId: clientePorUsuario.id };
    }

    const cliente = clientesDisponibles.find(item =>
        item.usuario.toLowerCase() === texto ||
        item.correo.toLowerCase() === texto
    );

    if (cliente) return { valor: cliente.usuario, clienteId: cliente.id };

    const coincidenciasNombre = clientesDisponibles.filter(item => item.nombre.toLowerCase() === texto);
    if (coincidenciasNombre.length > 1) {
        return {
            valor: "",
            clienteId: "",
            error: "Hay varios clientes con ese nombre. Selecciona el correcto desde la lista."
        };
    }

    if (coincidenciasNombre.length === 1) {
        return { valor: coincidenciasNombre[0].usuario, clienteId: coincidenciasNombre[0].id };
    }

    return { valor: valor.trim(), clienteId: "" };
}

function pintarSelectTecnicos(valorSeleccionado = "") {
    const select = document.getElementById("tecnicoServicio");
    if (!select) return;

    select.innerHTML = `<option value="">Asignar tÃ©cnico</option>`;

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
    if (select) select.innerHTML = `<option value="">Cargando tÃ©cnicos...</option>`;

    try {
        const respuesta = await fetch(`${API_BASE}/tecnicos/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudieron cargar los tÃ©cnicos.");

        tecnicosDisponibles = datos.tecnicos.filter(tecnico => tecnico.estado === "Activo");
        pintarSelectTecnicos();
    } catch (error) {
        tecnicosDisponibles = [];
        if (select) select.innerHTML = `<option value="">Sin tÃ©cnicos disponibles</option>`;
        mostrarNotificacion(error.message || "No se pudieron cargar los tÃ©cnicos.", "error");
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

function ordenListaParaFacturar(solicitud) {
    return estadoNormalizado(solicitud.estado) === "Completado" && !solicitud.facturada;
}

function ordenesFiltradas() {
    const texto = filtrosOrdenes.busqueda.trim().toLowerCase();

    return solicitudes.filter(solicitud => {
        const estado = estadoNormalizado(solicitud.estado);
        const prioridad = solicitud.prioridad || "Media";
        const coincideEstado = filtrosOrdenes.estado === "Todos" || estado === filtrosOrdenes.estado;
        const coincidePrioridad = filtrosOrdenes.prioridad === "Todas" || prioridad === filtrosOrdenes.prioridad;
        const coincideBusqueda = !texto || [
            solicitud.id,
            solicitud.cliente,
            solicitud.dispositivo,
            solicitud.servicio,
            solicitud.tecnicoNombre,
            solicitud.usuarioCliente
        ].some(valor => String(valor || "").toLowerCase().includes(texto));

        return coincideEstado && coincidePrioridad && coincideBusqueda;
    });
}

function actualizarContadorOrdenes(totalVisible) {
    const contador = document.getElementById("contadorOrdenes");
    if (!contador) return;
    const total = totalVisible ?? ordenesFiltradas().length;
    contador.textContent = `${total} ${total === 1 ? "orden" : "Ã³rdenes"}`;
}

function irAFacturacion(dbId) {
    window.location.href = `facturacion.html?solicitud=${encodeURIComponent(dbId)}`;
}
function nombreTecnico(valor) {
    const tecnico = tecnicosDisponibles.find(item => item.username === valor);
    return tecnico ? tecnico.nombre : valor;
}

function cargarServicios() {
    const tabla = document.querySelector("#tablaServicios tbody");
    if (!tabla) return;

    tabla.innerHTML = "";
    const visibles = ordenesFiltradas();
    actualizarContadorOrdenes(visibles.length);

    if (!visibles.length) {
        tabla.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">
                    <div class="empty-state">
                        <i class="fa-solid fa-screwdriver-wrench"></i>
                        <strong>Sin Ã³rdenes registradas</strong>
                        <span>Cuando un cliente solicite un servicio o el admin registre una orden presencial, aparecerÃ¡ aquÃ­.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    visibles.forEach(solicitud => {
        const puedeFacturar = ordenListaParaFacturar(solicitud);
        const textoFacturar = solicitud.facturada ? "Facturada" : "Facturar";
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
                    <button class="btn-eliminar-tabla" type="button" data-eliminar="${solicitud.dbId}">
                        <i class="fa-solid fa-trash"></i> Eliminar
                    </button>
                    ${estadoNormalizado(solicitud.estado) === "Completado" ? `
                        <button class="btn-facturar-orden" type="button" data-facturar="${solicitud.dbId}" ${puedeFacturar ? "" : "disabled"}>
                            <i class="fa-solid fa-file-invoice-dollar"></i> ${textoFacturar}
                        </button>
                    ` : ""}
                </div>
            </td>
        `;
        tabla.appendChild(fila);
    });

    tabla.querySelectorAll("[data-editar]").forEach(boton => {
        boton.addEventListener("click", () => editarServicio(Number(boton.dataset.editar)));
    });

    tabla.querySelectorAll("[data-facturar]").forEach(boton => {
        boton.addEventListener("click", () => irAFacturacion(Number(boton.dataset.facturar)));
    });

    tabla.querySelectorAll("[data-eliminar]").forEach(boton => {
        boton.addEventListener("click", () => eliminarServicio(Number(boton.dataset.eliminar)));
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
    clienteSeleccionado = null;
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
    document.getElementById("cliente").value = solicitud.usuarioCliente || solicitud.cliente;
    clienteSeleccionado = clientesDisponibles.find(cliente => cliente.usuario === solicitud.usuarioCliente) || null;
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
    const clienteResuelto = resolverClienteFormulario(document.getElementById("cliente").value);
    if (clienteResuelto.error) {
        mostrarNotificacion(clienteResuelto.error, "error");
        return;
    }

    const payload = {
        cliente: clienteResuelto.valor,
        clienteId: clienteResuelto.clienteId,
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

async function eliminarServicio(dbId) {
    const solicitud = solicitudes.find(item => item.dbId === dbId);
    if (!solicitud) return;

    const confirmado = await confirmarAccion({
        titulo: "Eliminar orden",
        mensaje: `Seguro que quieres eliminar ${solicitud.id} de ${solicitud.cliente}? Esta acciÃ³n no se puede deshacer.`
    });
    if (!confirmado) return;

    try {
        const token = await obtenerCsrfToken();
        const respuesta = await fetch(`${API_BASE}/servicios/${dbId}/eliminar/`, {
            method: "POST",
            credentials: "include",
            headers: { "X-CSRFToken": token }
        });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo eliminar la orden.");

        mostrarNotificacion("Orden eliminada correctamente.", "success");
        if (Number(document.getElementById("idEditar").value) === dbId) limpiarFormulario();
        await obtenerSolicitudes();
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo eliminar la orden.", "error");
    }
}

const inputCliente = document.getElementById("cliente");
const sugerenciasCliente = document.getElementById("clientesServicioList");

inputCliente?.addEventListener("input", () => {
    clienteSeleccionado = null;
    pintarDatalistClientes(inputCliente.value);
});
document.addEventListener("click", event => {
    if (!event.target.closest(".client-picker")) {
        if (sugerenciasCliente) sugerenciasCliente.hidden = true;
    }
});

function conectarFiltrosOrdenes() {
    const filtroEstado = document.getElementById("filtroEstadoOrden");
    const filtroPrioridad = document.getElementById("filtroPrioridadOrden");
    const buscarOrden = document.getElementById("buscarOrden");

    filtroEstado?.addEventListener("change", () => {
        filtrosOrdenes.estado = filtroEstado.value;
        cargarServicios();
    });

    filtroPrioridad?.addEventListener("change", () => {
        filtrosOrdenes.prioridad = filtroPrioridad.value;
        cargarServicios();
    });

    buscarOrden?.addEventListener("input", () => {
        filtrosOrdenes.busqueda = buscarOrden.value;
        cargarServicios();
    });
}
async function iniciarDashboardAdmin() {
    conectarFiltrosOrdenes();
    await Promise.all([cargarClientesDisponibles(), cargarTecnicosDisponibles()]);
    await obtenerSolicitudes();
}

iniciarDashboardAdmin();

