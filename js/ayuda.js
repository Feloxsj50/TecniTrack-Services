const API_BASE = (() => {
    const origin = window.location.origin;
    const localStaticPorts = ["5500", "5501", "5173"];

    if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
    if (localStaticPorts.includes(window.location.port)) {
        return window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
    }

    return origin;
})();
const sesionAyuda = TecniAuth.obtenerSesion();
const rolAyuda = sesionAyuda?.rol || "cliente";
let usuarioActual = null;
let tallerActual = null;
let ticketsSoporte = [];
let csrfToken = "";
let paginaTickets = 1;

const configuracionAyuda = {
    admin: {
        titulo: "Centro de Soporte del Sistema",
        formTitulo: "Responder Ticket",
        boton: "Enviar Respuesta",
        areas: ["Sistema", "Usuarios", "Inventario", "Recibos", "Reportes"],
        ticketsTitulo: "Tickets abiertos por usuarios"
    },
    tecnico: {
        titulo: "Soporte T\u00e9cnico",
        formTitulo: "Pedir Apoyo al Admin",
        boton: "Enviar Consulta",
        areas: ["Trabajo asignado", "Diagn\u00f3stico", "Inventario", "Estado del servicio"],
        ticketsTitulo: "Mis tickets de soporte"
    },
    cliente: {
        titulo: "Soporte al Cliente",
        formTitulo: "Contactar al Taller",
        boton: "Enviar Consulta",
        areas: ["Solicitud de servicio", "Estado del equipo", "Recibo", "Cuenta de usuario"],
        ticketsTitulo: "Mis consultas"
    }
};

const tallerDefault = {
    direccion: "Managua",
    telefono: "8888-0000",
    whatsapp: "8888-0000",
    horario: "Lun-Sab"
};

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function obtenerControl(id, selectorAlternativo) {
    return document.getElementById(id) || document.querySelector(selectorAlternativo);
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
    if (!respuesta.ok || !datos.ok) throw new Error("No se pudo preparar la seguridad de Django.");
    csrfToken = datos.csrfToken;
    return csrfToken;
}

async function apiJson(url, opciones = {}) {
    const necesitaCsrf = opciones.method && opciones.method !== "GET";
    const respuesta = await fetch(`${API_BASE}${url}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(necesitaCsrf ? { "X-CSRFToken": await obtenerCsrfToken() } : {}),
            ...(opciones.headers || {})
        },
        ...opciones
    });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo completar la acci\u00f3n.");
    return datos;
}

function ticketsVisibles() {
    return ticketsSoporte;
}

function metricasSoporteAdmin() {
    const respondidos = ticketsSoporte.filter(ticket => ticket.respuesta || ticket.estado === "Respondido");
    const pendientes = ticketsSoporte.filter(ticket => !ticket.respuesta && ticket.estado !== "Respondido");
    const tiempos = respondidos
        .map(ticket => {
            if (!ticket.creadoEn || !ticket.respondidoEn) return null;
            return new Date(ticket.respondidoEn).getTime() - new Date(ticket.creadoEn).getTime();
        })
        .filter(tiempo => Number.isFinite(tiempo) && tiempo >= 0);

    return {
        total: ticketsSoporte.length,
        respondidos: respondidos.length,
        pendientes: pendientes.length,
        tiempoPromedio: formatearDuracion(tiempos)
    };
}

function formatearDuracion(tiempos) {
    if (!tiempos.length) return "N/D";
    const promedio = tiempos.reduce((total, tiempo) => total + tiempo, 0) / tiempos.length;
    const minutos = Math.max(1, Math.round(promedio / 60000));
    if (minutos < 60) return `${minutos}m`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `${horas}h`;
    return `${Math.round(horas / 24)}d`;
}

function configurarCards(config) {
    if (rolAyuda === "admin") {
        const metricas = metricasSoporteAdmin();
        document.getElementById("statPrincipal").textContent = metricas.respondidos;
        document.getElementById("statPrincipalTexto").textContent = "Tickets Respondidos";
        document.getElementById("statCanal").textContent = metricas.pendientes;
        document.getElementById("statCanalTexto").textContent = "Sin Responder";
        document.getElementById("statTickets").textContent = metricas.total;
        document.getElementById("statTicketsTexto").textContent = "Tickets Totales";
        document.getElementById("statTiempo").textContent = metricas.tiempoPromedio;
        document.getElementById("statTiempoTexto").textContent = "Tiempo Resp.";
        return;
    }

    const pendientes = ticketsVisibles().filter(ticket => !ticket.respuesta && ticket.estado !== "Respondido").length;

    if (rolAyuda === "cliente") {
        const taller = tallerActual || tallerDefault;
        document.getElementById("statPrincipal").textContent = taller.direccion || tallerDefault.direccion;
        document.getElementById("statPrincipalTexto").textContent = "Direcci\u00f3n del Taller";
        document.getElementById("statCanal").textContent = taller.telefono || tallerDefault.telefono;
        document.getElementById("statCanalTexto").textContent = "Tel\u00e9fono Directo";
        document.getElementById("statTickets").textContent = taller.horario || tallerDefault.horario;
        document.getElementById("statTicketsTexto").textContent = "Horario de Atenci\u00f3n";
        document.getElementById("statTiempo").textContent = taller.whatsapp || tallerDefault.whatsapp;
        document.getElementById("statTiempoTexto").textContent = "WhatsApp";
        return;
    }

    document.getElementById("statPrincipal").textContent = "Tec";
    document.getElementById("statPrincipalTexto").textContent = "Mesa Interna";
    document.getElementById("statCanal").textContent = "Web";
    document.getElementById("statCanalTexto").textContent = "Canal de Soporte";
    document.getElementById("statTickets").textContent = ticketsVisibles().length;
    document.getElementById("statTicketsTexto").textContent = "Mis Tickets";
    document.getElementById("statTiempo").textContent = pendientes;
    document.getElementById("statTiempoTexto").textContent = "Sin Responder";
}

function autollenarDatos() {
    const nombre = usuarioActual?.nombre || sesionAyuda?.usuario || "Usuario TecniTrack";
    const correo = usuarioActual?.email || "";
    document.getElementById("soporteNombre").value = nombre;
    document.getElementById("soporteCorreo").value = correo;
}

function configurarVista() {
    const config = configuracionAyuda[rolAyuda] || configuracionAyuda.cliente;

    document.getElementById("ayudaTitulo").textContent = config.titulo;
    configurarCards(config);
    document.getElementById("formTitulo").textContent = config.formTitulo;
    document.getElementById("btnSoporte").textContent = config.boton;
    document.getElementById("ticketsTitulo").textContent = config.ticketsTitulo;
    document.getElementById("faqCliente").hidden = rolAyuda !== "cliente";
    document.getElementById("formSoporte").hidden = rolAyuda === "admin";
    document.getElementById("filtrosSoporte").hidden = rolAyuda !== "admin";

    obtenerControl("soporteArea", 'select[id^="soporte"]').innerHTML = config.areas
        .map(area => `<option value="${escaparHtml(area)}">${escaparHtml(area)}</option>`)
        .join("");

    if (rolAyuda === "admin") cargarFiltrosAdmin();
}

function cargarFiltrosAdmin() {
    const areas = [...new Set(ticketsSoporte.map(ticket => ticket.area).filter(Boolean))];
    const select = obtenerControl("filtroAreaTicket", 'select[id^="filtro"]:not(#filtroEstadoTicket)');
    const valorActual = select.value || "todas";

    select.innerHTML = `
        <option value="todas">Todas las \u00e1reas</option>
        ${areas.map(area => `<option value="${escaparHtml(area)}">${escaparHtml(area)}</option>`).join("")}
    `;

    select.value = areas.includes(valorActual) ? valorActual : "todas";
}

function renderizarEncabezadoTickets() {
    const columnas = rolAyuda === "cliente"
        ? ["Fecha", "ID", "\u00c1rea", "Asunto", "Respuesta", "Estado", "Acciones"]
        : ["Fecha", "ID", "Usuario", "\u00c1rea", "Asunto", "Respuesta", "Estado", "Acciones"];

    document.getElementById("ticketsHead").innerHTML = columnas
        .map(columna => `<th>${columna}</th>`)
        .join("");
}

function ticketsFiltrados() {
    let tickets = ticketsVisibles();
    if (rolAyuda !== "admin") return tickets;

    const estado = document.getElementById("filtroEstadoTicket")?.value || "todos";
    const area = document.getElementById("filtroAreaTicket")?.value || "todas";

    if (estado === "sin-responder") {
        tickets = tickets.filter(ticket => !ticket.respuesta && ticket.estado !== "Respondido");
    } else if (estado !== "todos") {
        tickets = tickets.filter(ticket => ticket.estado === estado);
    }

    if (area !== "todas") tickets = tickets.filter(ticket => ticket.area === area);
    return tickets;
}

function renderizarTickets() {
    const tbody = document.querySelector("#tablaTickets tbody");
    const tickets = ticketsFiltrados();
    const columnas = rolAyuda === "cliente" ? 7 : 8;

    if (!tickets.length) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="${columnas}">
                    <div class="empty-state">
                        <i class="fa-solid fa-headset"></i>
                        <strong>Sin consultas registradas</strong>
                        <span>Cuando env\u00edes una consulta de soporte, aparecer\u00e1 aqu\u00ed.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = obtenerPagina(tickets, paginaTickets).map(ticket => {
        const respuesta = ticket.respuesta || "Pendiente de respuesta";
        const usuario = rolAyuda === "cliente" ? "" : `<td>${escaparHtml(ticket.nombre)}</td>`;
        const acciones = accionesTicket(ticket);

        return `
            <tr>
                <td>${escaparHtml(ticket.fecha)}</td>
                <td>${escaparHtml(ticket.id)}</td>
                ${usuario}
                <td>${escaparHtml(ticket.area)}</td>
                <td>${escaparHtml(ticket.asunto)}</td>
                <td>${escaparHtml(respuesta)}</td>
                <td><span class="estado ${ticket.estado === "Respondido" ? "completado" : "en-proceso"}">${escaparHtml(ticket.estado)}</span></td>
                ${acciones}
            </tr>
        `;
    }).join("");

    tbody.querySelectorAll("[data-responder]").forEach(boton => {
        boton.addEventListener("click", () => responderTicket(Number(boton.dataset.responder)));
    });

    tbody.querySelectorAll("[data-ver-mensaje]").forEach(boton => {
        boton.addEventListener("click", () => verMensaje(Number(boton.dataset.verMensaje)));
    });

    tbody.querySelectorAll("[data-ver-respuesta]").forEach(boton => {
        boton.addEventListener("click", () => verRespuesta(Number(boton.dataset.verRespuesta)));
    });
    renderizarPaginacion("paginacionTickets", tickets.length, paginaTickets, pagina => {
        paginaTickets = pagina;
        renderizarTickets();
    });
}

function accionesTicket(ticket) {
    if (rolAyuda === "admin") {
        return `
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-editar-historial" data-ver-mensaje="${ticket.dbId}">
                        <i class="fa-solid fa-envelope-open-text"></i> Ver mensaje
                    </button>
                    <button type="button" class="btn-editar-historial" data-responder="${ticket.dbId}">
                        <i class="fa-solid fa-reply"></i> ${ticket.respuesta ? "Editar respuesta" : "Responder"}
                    </button>
                </div>
            </td>
        `;
    }

    if (ticket.respuesta) {
        return `
            <td>
                <button type="button" class="btn-editar-historial" data-ver-respuesta="${ticket.dbId}">
                    <i class="fa-solid fa-eye"></i> Ver respuesta
                </button>
            </td>
        `;
    }

    return `<td><span class="estado pendiente">Sin respuesta</span></td>`;
}

function buscarTicket(dbId) {
    return ticketsSoporte.find(item => item.dbId === Number(dbId));
}

function responderTicket(dbId) {
    const ticket = buscarTicket(dbId);
    if (!ticket) return;

    prepararModalRespuesta("editar");
    document.getElementById("respuestaId").value = ticket.dbId;
    document.getElementById("respuestaTicketId").textContent = ticket.id;
    document.getElementById("respuestaTitulo").textContent = `Responder a ${ticket.nombre}`;
    document.getElementById("respuestaResumen").textContent = `${ticket.area} - ${ticket.asunto}`;
    document.getElementById("respuestaTexto").value = ticket.respuesta || "";

    document.getElementById("modalRespuesta").hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("respuestaTexto").focus();
}

function verRespuesta(dbId) {
    const ticket = buscarTicket(dbId);
    if (!ticket || !ticket.respuesta) return;

    prepararModalRespuesta("lectura");
    document.getElementById("respuestaTicketId").textContent = ticket.id;
    document.getElementById("respuestaTitulo").textContent = "Respuesta de soporte";
    document.getElementById("respuestaResumen").textContent = `${ticket.area} - ${ticket.asunto}`;
    document.getElementById("respuestaCompleta").textContent = ticket.respuesta;

    document.getElementById("modalRespuesta").hidden = false;
    document.body.classList.add("modal-open");
}

function verMensaje(dbId) {
    const ticket = buscarTicket(dbId);
    if (!ticket) return;

    prepararModalRespuesta("lectura");
    document.getElementById("respuestaTicketId").textContent = ticket.id;
    document.getElementById("respuestaTitulo").textContent = `Mensaje de ${ticket.nombre}`;
    document.getElementById("respuestaResumen").textContent = `${ticket.area} - ${ticket.asunto}`;
    document.getElementById("respuestaCompleta").textContent = ticket.detalle || "Sin detalle registrado.";

    document.getElementById("modalRespuesta").hidden = false;
    document.body.classList.add("modal-open");
}

function prepararModalRespuesta(modo) {
    const esLectura = modo === "lectura";
    document.getElementById("formRespuesta").hidden = esLectura;
    document.getElementById("respuestaLectura").hidden = !esLectura;
}

function cerrarModalRespuesta() {
    document.getElementById("modalRespuesta").hidden = true;
    document.body.classList.remove("modal-open");
    document.getElementById("formRespuesta").reset();
    document.getElementById("respuestaCompleta").textContent = "";
}

async function cargarDatosBase() {
    const [me, tickets, taller] = await Promise.all([
        apiJson("/usuarios/me/"),
        apiJson("/soporte/"),
        apiJson("/usuarios/taller/").catch(() => ({ taller: tallerDefault }))
    ]);

    usuarioActual = me.usuario;
    ticketsSoporte = tickets.tickets || [];
    tallerActual = taller.taller || tallerDefault;
}

document.getElementById("formRespuesta").addEventListener("submit", async event => {
    event.preventDefault();

    const dbId = document.getElementById("respuestaId").value;
    const respuesta = document.getElementById("respuestaTexto").value.trim();
    if (!respuesta) return mostrarNotificacion("Escribe una respuesta antes de enviarla.", "error");

    try {
        await apiJson(`/soporte/${dbId}/responder/`, {
            method: "POST",
            body: JSON.stringify({ respuesta })
        });
        await cargarDatosBase();
        cerrarModalRespuesta();
        configurarVista();
        renderizarTickets();
        mostrarNotificacion("Respuesta guardada correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo guardar la respuesta.", "error");
    }
});

document.querySelectorAll("[data-cerrar-respuesta]").forEach(elemento => {
    elemento.addEventListener("click", cerrarModalRespuesta);
});

document.addEventListener("keydown", event => {
    const modal = document.getElementById("modalRespuesta");
    if (event.key === "Escape" && !modal.hidden) cerrarModalRespuesta();
});

document.getElementById("formSoporte").addEventListener("submit", async event => {
    event.preventDefault();

    const payload = {
        nombre: document.getElementById("soporteNombre").value.trim(),
        correo: document.getElementById("soporteCorreo").value.trim(),
        asunto: document.getElementById("soporteAsunto").value.trim(),
        area: obtenerControl("soporteArea", 'select[id^="soporte"]').value,
        detalle: document.getElementById("soporteDetalle").value.trim()
    };

    if (!payload.nombre || !payload.correo || !payload.asunto || !payload.detalle) {
        mostrarNotificacion("Completa todos los campos de soporte.", "error");
        return;
    }

    try {
        await apiJson("/soporte/crear/", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        event.target.reset();
        await cargarDatosBase();
        autollenarDatos();
        configurarVista();
        renderizarEncabezadoTickets();
        renderizarTickets();
        mostrarNotificacion("Consulta registrada correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo registrar la consulta.", "error");
    }
});

document.getElementById("filtroEstadoTicket")?.addEventListener("change", renderizarTickets);
obtenerControl("filtroAreaTicket", 'select[id^="filtro"]:not(#filtroEstadoTicket)')?.addEventListener("change", renderizarTickets);

async function iniciarAyuda() {
    try {
        await cargarDatosBase();
        configurarVista();
        autollenarDatos();
        renderizarEncabezadoTickets();
        renderizarTickets();
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo cargar soporte.", "error");
    }
}

iniciarAyuda();
