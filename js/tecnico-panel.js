const API_BASE = (() => {
    const origin = window.location.origin;
    const localStaticPorts = ["5500", "5501", "5173"];

    if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
    if (localStaticPorts.includes(window.location.port)) {
        return window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
    }

    return origin;
})();

const formTecnico = document.getElementById("formTecnico");
const tablaTecnico = document.querySelector("#tablaServicios tbody");
const panelTrabajo = document.getElementById("panelTrabajo");
const panelBackdrop = document.getElementById("panelTrabajoBackdrop");
const filtrosTrabajo = { estado: "Todos", prioridad: "Todas", busqueda: "" };
let solicitudesAsignadasLista = [];
let trabajoActivoPanel = null;
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
        return { ok: false, error: "Django devolvió una respuesta no válida." };
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

function pesoPrioridad(prioridad) {
    if (prioridad === "Alta") return 3;
    if (prioridad === "Media") return 2;
    return 1;
}

function pesoEstado(estado) {
    const normalizado = estadoNormalizado(estado);
    if (normalizado === "En Proceso") return 3;
    if (normalizado === "Pendiente") return 2;
    return 1;
}

function diasAbierto(solicitud) {
    const base = solicitud.creadoEn || solicitud.fecha;
    const inicio = new Date(base);
    if (Number.isNaN(inicio.getTime())) return 0;
    const hoy = new Date();
    const diferencia = hoy.setHours(0, 0, 0, 0) - inicio.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor(diferencia / 86400000));
}

function ordenarTrabajos(lista) {
    return lista.slice().sort((a, b) => {
        const estado = pesoEstado(b.estado) - pesoEstado(a.estado);
        if (estado) return estado;
        const prioridad = pesoPrioridad(b.prioridad) - pesoPrioridad(a.prioridad);
        if (prioridad) return prioridad;
        return diasAbierto(b) - diasAbierto(a);
    });
}

function trabajosActivos() {
    return solicitudesAsignadasLista.filter(solicitud => estadoNormalizado(solicitud.estado) !== "Completado");
}

function trabajosFiltrados() {
    const texto = filtrosTrabajo.busqueda.trim().toLowerCase();

    return ordenarTrabajos(solicitudesAsignadasLista).filter(solicitud => {
        const estado = estadoNormalizado(solicitud.estado);
        const prioridad = solicitud.prioridad || "Media";
        const coincideEstado = filtrosTrabajo.estado === "Todos" || estado === filtrosTrabajo.estado;
        const coincidePrioridad = filtrosTrabajo.prioridad === "Todas" || prioridad === filtrosTrabajo.prioridad;
        const coincideBusqueda = !texto || [
            solicitud.id,
            solicitud.cliente,
            solicitud.dispositivo,
            solicitud.servicio
        ].some(valor => String(valor || "").toLowerCase().includes(texto));

        return coincideEstado && coincidePrioridad && coincideBusqueda;
    });
}

function actualizarCards() {
    document.getElementById("totalAsignados").textContent = solicitudesAsignadasLista.length;
    document.getElementById("totalProceso").textContent =
        solicitudesAsignadasLista.filter(solicitud => estadoNormalizado(solicitud.estado) === "En Proceso").length;
    document.getElementById("totalCompletados").textContent =
        solicitudesAsignadasLista.filter(solicitud => estadoNormalizado(solicitud.estado) === "Completado").length;
    document.getElementById("totalPendientes").textContent =
        solicitudesAsignadasLista.filter(solicitud => estadoNormalizado(solicitud.estado) === "Pendiente").length;
}

function actualizarContadorTrabajos(totalVisible) {
    const contador = document.getElementById("contadorTrabajos");
    if (!contador) return;
    contador.textContent = `${totalVisible} ${totalVisible === 1 ? "trabajo" : "trabajos"}`;
}

function renderizarProximoTrabajo() {
    const proximo = ordenarTrabajos(trabajosActivos())[0];
    const titulo = document.getElementById("proximoTrabajoTitulo");
    const detalle = document.getElementById("proximoTrabajoDetalle");
    const boton = document.getElementById("btnProximoTrabajo");

    if (!proximo) {
        titulo.textContent = "Sin trabajos activos";
        detalle.textContent = "Cuando el admin asigne una orden, aparecerá aquí la más urgente.";
        boton.disabled = true;
        boton.onclick = null;
        return;
    }

    const dias = diasAbierto(proximo);
    titulo.textContent = `${proximo.cliente} - ${proximo.dispositivo}`;
    detalle.textContent = `${proximo.id} - ${proximo.servicio} - ${proximo.prioridad || "Media"} - ${dias} ${dias === 1 ? "día" : "días"} abierto`;
    boton.disabled = false;
    boton.onclick = () => abrirPanelTrabajo(proximo.dbId);
}

function renderizarNotificaciones() {
    const contenedor = document.getElementById("notificacionesTecnico");
    const activos = trabajosActivos();
    const urgentes = activos.filter(solicitud => solicitud.prioridad === "Alta");
    const atrasados = activos.filter(solicitud => diasAbierto(solicitud) >= 3);

    if (!activos.length) {
        contenedor.innerHTML = `
            <div class="tech-alert muted">
                <i class="fa-solid fa-circle-check"></i>
                <span>No tienes trabajos pendientes por ahora.</span>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = `
        <div class="tech-alert">
            <i class="fa-solid fa-bell"></i>
            <span>Tienes ${activos.length} trabajo${activos.length === 1 ? "" : "s"} activo${activos.length === 1 ? "" : "s"} asignado${activos.length === 1 ? "" : "s"}.</span>
        </div>
        ${urgentes.length ? `
            <div class="tech-alert urgent">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>${urgentes.length} con prioridad alta.</span>
            </div>
        ` : ""}
        ${atrasados.length ? `
            <div class="tech-alert urgent">
                <i class="fa-solid fa-clock"></i>
                <span>${atrasados.length} lleva${atrasados.length === 1 ? "" : "n"} 3 días o más abierto${atrasados.length === 1 ? "" : "s"}.</span>
            </div>
        ` : ""}
    `;
}

function textoAccion(solicitud) {
    const estado = estadoNormalizado(solicitud.estado);
    if (estado === "Pendiente") return "Iniciar";
    if (estado === "Completado") return "Ver";
    return "Actualizar";
}

function renderizarAsignadas() {
    tablaTecnico.innerHTML = "";
    actualizarCards();
    renderizarNotificaciones();
    renderizarProximoTrabajo();

    const visibles = trabajosFiltrados();
    actualizarContadorTrabajos(visibles.length);

    if (!visibles.length) {
        tablaTecnico.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">
                    <div class="empty-state">
                        <i class="fa-solid fa-screwdriver-wrench"></i>
                        <strong>Sin trabajos para mostrar</strong>
                        <span>Ajusta los filtros o espera una nueva asignacion del admin.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    visibles.forEach(solicitud => {
        const dias = diasAbierto(solicitud);
        const accion = textoAccion(solicitud);
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${escaparHtml(solicitud.fecha)}</td>
            <td>${escaparHtml(solicitud.id)}</td>
            <td>${escaparHtml(solicitud.cliente)}</td>
            <td>${escaparHtml(solicitud.dispositivo)}</td>
            <td>${escaparHtml(solicitud.servicio)}</td>
            <td><span class="${clasePrioridad(solicitud.prioridad)}">${escaparHtml(solicitud.prioridad || "Media")}</span></td>
            <td>${dias} ${dias === 1 ? "día" : "días"}</td>
            <td><span class="estado ${claseEstado(solicitud.estado)}">${escaparHtml(estadoNormalizado(solicitud.estado))}</span></td>
            <td>
                <div class="table-actions">
                    ${estadoNormalizado(solicitud.estado) === "Pendiente" ? `
                        <button type="button" class="btn-iniciar-trabajo" data-iniciar="${solicitud.dbId}">
                            <i class="fa-solid fa-play"></i> Iniciar
                        </button>
                    ` : ""}
                    <button type="button" class="btn-editar-historial" data-trabajo="${solicitud.dbId}">
                        <i class="fa-solid fa-eye"></i> ${accion}
                    </button>
                </div>
            </td>
        `;
        tablaTecnico.appendChild(fila);
    });

    tablaTecnico.querySelectorAll("[data-trabajo]").forEach(boton => {
        boton.addEventListener("click", () => abrirPanelTrabajo(Number(boton.dataset.trabajo)));
    });

    tablaTecnico.querySelectorAll("[data-iniciar]").forEach(boton => {
        boton.addEventListener("click", () => iniciarTrabajoRapido(Number(boton.dataset.iniciar)));
    });
}

async function cargarSolicitudesAsignadas() {
    try {
        const respuesta = await fetch(`${API_BASE}/servicios/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudieron cargar tus trabajos.");

        solicitudesAsignadasLista = datos.solicitudes;
        renderizarAsignadas();
    } catch (error) {
        solicitudesAsignadasLista = [];
        renderizarAsignadas();
        mostrarNotificacion(error.message || "No se pudieron cargar tus trabajos.", "error");
    }
}

function renderizarMetaPanel(solicitud) {
    const dias = diasAbierto(solicitud);
    document.getElementById("panelTrabajoMeta").innerHTML = `
        <div><span>Cliente</span><strong>${escaparHtml(solicitud.cliente)}</strong></div>
        <div><span>Equipo</span><strong>${escaparHtml(solicitud.dispositivo)}</strong></div>
        <div><span>Servicio</span><strong>${escaparHtml(solicitud.servicio)}</strong></div>
        <div><span>Prioridad</span><strong>${escaparHtml(solicitud.prioridad || "Media")}</strong></div>
        <div><span>Tiempo abierto</span><strong>${dias} ${dias === 1 ? "día" : "días"}</strong></div>
    `;
}

function abrirPanelTrabajo(dbId) {
    const solicitud = solicitudesAsignadasLista.find(item => item.dbId === dbId);
    if (!solicitud) return;

    trabajoActivoPanel = solicitud;
    const completado = estadoNormalizado(solicitud.estado) === "Completado";

    document.getElementById("idServicioTecnico").value = solicitud.dbId;
    document.getElementById("diagnosticoTecnico").value = solicitud.diagnostico || "";
    document.getElementById("repuestoTecnico").value = solicitud.repuesto || "";
    document.getElementById("estadoTecnico").value = completado ? "Completado" : "En Proceso";
    document.getElementById("panelTrabajoId").textContent = solicitud.id;
    document.getElementById("panelTrabajoTitulo").textContent = `${solicitud.cliente} - ${solicitud.dispositivo}`;
    renderizarMetaPanel(solicitud);

    formTecnico.classList.toggle("is-readonly", completado);
    document.getElementById("diagnosticoTecnico").readOnly = completado;
    document.getElementById("repuestoTecnico").readOnly = completado;
    document.getElementById("estadoTecnico").disabled = completado;
    document.getElementById("btnGuardarTrabajo").hidden = completado;

    panelTrabajo.hidden = false;
    panelBackdrop.hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("diagnosticoTecnico").focus();
}

function cerrarPanelTrabajo() {
    panelTrabajo.hidden = true;
    panelBackdrop.hidden = true;
    trabajoActivoPanel = null;
    document.body.classList.remove("modal-open");
    formTecnico.classList.remove("is-readonly");
    document.getElementById("diagnosticoTecnico").readOnly = false;
    document.getElementById("repuestoTecnico").readOnly = false;
    document.getElementById("estadoTecnico").disabled = false;
    document.getElementById("btnGuardarTrabajo").hidden = false;
    formTecnico.reset();
}

async function actualizarTrabajo(id, payload, mensajeExito) {
    const token = await obtenerCsrfToken();
    const respuesta = await fetch(`${API_BASE}/servicios/${id}/actualizar/`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": token
        },
        body: JSON.stringify(payload)
    });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo actualizar el trabajo.");

    await cargarSolicitudesAsignadas();
    mostrarNotificacion(mensajeExito, "success");
}

async function iniciarTrabajoRapido(dbId) {
    const solicitud = solicitudesAsignadasLista.find(item => item.dbId === dbId);
    if (!solicitud) return;

    try {
        await actualizarTrabajo(dbId, {
            diagnostico: solicitud.diagnostico || "",
            repuesto: solicitud.repuesto || "",
            estado: "En Proceso"
        }, "Trabajo iniciado correctamente.");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo iniciar el trabajo.", "error");
    }
}

formTecnico.addEventListener("submit", async event => {
    event.preventDefault();

    const id = document.getElementById("idServicioTecnico").value;
    const diagnostico = document.getElementById("diagnosticoTecnico").value.trim();
    const repuesto = document.getElementById("repuestoTecnico").value.trim();
    const estado = document.getElementById("estadoTecnico").value;

    if (estado === "Completado" && diagnostico.length < 10) {
        mostrarNotificacion("Para completar el trabajo, escribe un diagnostico claro de al menos 10 caracteres.", "error");
        return;
    }

    try {
        await actualizarTrabajo(id, { diagnostico, repuesto, estado }, "Trabajo actualizado correctamente.");
        cerrarPanelTrabajo();
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo actualizar el trabajo.", "error");
    }
});

function conectarFiltrosTrabajo() {
    const filtroEstado = document.getElementById("filtroEstadoTrabajo");
    const filtroPrioridad = document.getElementById("filtroPrioridadTrabajo");
    const buscarTrabajo = document.getElementById("buscarTrabajo");

    filtroEstado?.addEventListener("change", () => {
        filtrosTrabajo.estado = filtroEstado.value;
        renderizarAsignadas();
    });

    filtroPrioridad?.addEventListener("change", () => {
        filtrosTrabajo.prioridad = filtroPrioridad.value;
        renderizarAsignadas();
    });

    buscarTrabajo?.addEventListener("input", () => {
        filtrosTrabajo.busqueda = buscarTrabajo.value;
        renderizarAsignadas();
    });
}


function renderizarInventarioRapido(productos) {
    const contenedor = document.getElementById("inventarioRapidoTecnico");
    if (!contenedor) return;

    const visibles = productos
        .filter(producto => Number(producto.stock) > 0)
        .sort((a, b) => Number(a.stock) - Number(b.stock))
        .slice(0, 3);

    if (!visibles.length) {
        contenedor.innerHTML = `
            <div>
                <span>Inventario</span>
                <strong>Sin productos disponibles</strong>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = visibles.map(producto => `
        <div>
            <span>${escaparHtml(producto.nombre)}</span>
            <strong>${escaparHtml(producto.stock)} disponibles</strong>
        </div>
    `).join("");
}

async function cargarInventarioRapido() {
    try {
        const respuesta = await fetch(`${API_BASE}/inventario/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo cargar inventario.");
        renderizarInventarioRapido(datos.productos || []);
    } catch (error) {
        renderizarInventarioRapido([]);
    }
}
function iniciarPanelTecnico() {
    conectarFiltrosTrabajo();
    document.getElementById("cerrarPanelTrabajo").addEventListener("click", cerrarPanelTrabajo);
    panelBackdrop.addEventListener("click", cerrarPanelTrabajo);
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panelTrabajo.hidden) cerrarPanelTrabajo();
    });
    cargarSolicitudesAsignadas();
}

iniciarPanelTecnico();
