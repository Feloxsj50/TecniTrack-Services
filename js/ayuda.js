const STORAGE_KEY_TICKETS = "tecnitrackTicketsSoporte";
const STORAGE_TALLER = "tecnitrackTaller";

const sesionAyuda = TecniAuth.obtenerSesion();
const rolAyuda = sesionAyuda?.rol || "cliente";
const usuarioAyuda = sesionAyuda?.usuario || rolAyuda;

const datosPerfil = {
    admin: { nombre: "Administrador TecniTrack", correo: "admin@tecnitrack.com" },
    tecnico: { nombre: "Tecnico TecniTrack", correo: "tecnico@tecnitrack.com" },
    cliente: { nombre: "Cliente TecniTrack", correo: "cliente@email.com" }
};

const configuracionAyuda = {
    admin: {
        titulo: "Centro de Soporte del Sistema",
        cards: [
            ["Admin", "Vista General"],
            ["Web", "Canal de Soporte"],
            [null, "Tickets Totales"],
            [null, "Sin Responder"]
        ],
        formTitulo: "Registrar Nota Interna",
        boton: "Guardar Nota",
        areas: ["Sistema", "Usuarios", "Inventario", "Recibos", "Reportes"],
        ticketsTitulo: "Tickets abiertos por usuarios"
    },
    tecnico: {
        titulo: "Soporte Tecnico",
        cards: [
            ["Tec", "Mesa Interna"],
            ["Web", "Canal de Soporte"],
            [null, "Mis Tickets"],
            [null, "Sin Responder"]
        ],
        formTitulo: "Pedir Apoyo al Admin",
        boton: "Enviar Consulta",
        areas: ["Trabajo asignado", "Diagnostico", "Inventario", "Estado del servicio"],
        ticketsTitulo: "Mis tickets de soporte"
    },
    cliente: {
        titulo: "Soporte al Cliente",
        cards: [
            ["Managua", "Direccion del Taller"],
            ["8888-0000", "Telefono Directo"],
            ["Lun-Sab", "Horario de Atencion"],
            ["WhatsApp", "Contacto Rapido"]
        ],
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

function obtenerTaller() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_TALLER)) || tallerDefault;
    } catch {
        return tallerDefault;
    }
}

function obtenerTickets() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_TICKETS)) || [];
    } catch {
        return [];
    }
}

function guardarTickets(tickets) {
    localStorage.setItem(STORAGE_KEY_TICKETS, JSON.stringify(tickets));
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function fechaHoy() {
    return new Date().toISOString().slice(0, 10);
}

function ticketsVisibles() {
    const tickets = obtenerTickets();
    if (rolAyuda === "admin") return tickets;
    return tickets.filter(ticket => ticket.usuario === usuarioAyuda && ticket.rol === rolAyuda);
}

function configurarCards(config, totalTickets) {
    const ids = [
        ["statPrincipal", "statPrincipalTexto"],
        ["statCanal", "statCanalTexto"],
        ["statTickets", "statTicketsTexto"],
        ["statTiempo", "statTiempoTexto"]
    ];

    const pendientes = ticketsVisibles().filter(ticket => !ticket.respuesta && ticket.estado !== "Respondido").length;

    config.cards.forEach((card, index) => {
        const [valorId, textoId] = ids[index];
        document.getElementById(valorId).textContent = card[0] ?? (index === 3 ? pendientes : totalTickets);
        document.getElementById(textoId).textContent = card[1];
    });
}

function autollenarDatos() {
    const perfil = datosPerfil[rolAyuda] || datosPerfil.cliente;
    document.getElementById("soporteNombre").value = perfil.nombre;
    document.getElementById("soporteCorreo").value = perfil.correo;
}

function configurarVista() {
    const config = configuracionAyuda[rolAyuda] || configuracionAyuda.cliente;
    const tickets = ticketsVisibles();

    if (rolAyuda === "cliente") {
        const taller = obtenerTaller();
        config.cards = [
            [taller.direccion || tallerDefault.direccion, "Direccion del Taller"],
            [taller.telefono || tallerDefault.telefono, "Telefono Directo"],
            [taller.horario || tallerDefault.horario, "Horario de Atencion"],
            [taller.whatsapp || tallerDefault.whatsapp, "WhatsApp"]
        ];
    }

    document.getElementById("ayudaTitulo").textContent = config.titulo;
    configurarCards(config, tickets.length);
    document.getElementById("formTitulo").textContent = config.formTitulo;
    document.getElementById("btnSoporte").textContent = config.boton;
    document.getElementById("ticketsTitulo").textContent = config.ticketsTitulo;
    document.getElementById("faqCliente").hidden = rolAyuda !== "cliente";

    document.getElementById("soporteArea").innerHTML = config.areas
        .map(area => `<option value="${escaparHtml(area)}">${escaparHtml(area)}</option>`)
        .join("");
}

function renderizarEncabezadoTickets() {
    const columnas = rolAyuda === "cliente"
        ? ["Fecha", "ID", "Area", "Asunto", "Respuesta", "Estado", "Acciones"]
        : rolAyuda === "admin"
            ? ["Fecha", "ID", "Usuario", "Area", "Asunto", "Respuesta", "Estado", "Acciones"]
            : ["Fecha", "ID", "Usuario", "Area", "Asunto", "Respuesta", "Estado", "Acciones"];

    document.getElementById("ticketsHead").innerHTML = columnas
        .map(columna => `<th>${columna}</th>`)
        .join("");
}

function renderizarTickets() {
    const tbody = document.querySelector("#tablaTickets tbody");
    const tickets = ticketsVisibles();
    const columnas = rolAyuda === "cliente" ? 7 : 8;

    if (!tickets.length) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="${columnas}">
                    <div class="empty-state">
                        <i class="fa-solid fa-headset"></i>
                        <strong>Sin consultas registradas</strong>
                        <span>Cuando envies una consulta de soporte, aparecera aqui.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = tickets.map(ticket => {
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
                <td><span class="estado en-proceso">${escaparHtml(ticket.estado)}</span></td>
                ${acciones}
            </tr>
        `;
    }).join("");

    tbody.querySelectorAll("[data-responder]").forEach(boton => {
        boton.addEventListener("click", () => responderTicket(boton.dataset.responder));
    });

    tbody.querySelectorAll("[data-ver-mensaje]").forEach(boton => {
        boton.addEventListener("click", () => verMensaje(boton.dataset.verMensaje));
    });

    tbody.querySelectorAll("[data-ver-respuesta]").forEach(boton => {
        boton.addEventListener("click", () => verRespuesta(boton.dataset.verRespuesta));
    });
}

function accionesTicket(ticket) {
    if (rolAyuda === "admin") {
        return `
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-editar-historial" data-ver-mensaje="${ticket.id}">
                        <i class="fa-solid fa-envelope-open-text"></i> Ver mensaje
                    </button>
                    <button type="button" class="btn-editar-historial" data-responder="${ticket.id}">
                        <i class="fa-solid fa-reply"></i> ${ticket.respuesta ? "Editar respuesta" : "Responder"}
                    </button>
                </div>
            </td>
        `;
    }

    if (ticket.respuesta) {
        return `
            <td>
                <button type="button" class="btn-editar-historial" data-ver-respuesta="${ticket.id}">
                    <i class="fa-solid fa-eye"></i> Ver respuesta
                </button>
            </td>
        `;
    }

    return `<td><span class="estado pendiente">Sin respuesta</span></td>`;
}

function crearIdTicket(tickets) {
    return `TK-${String(tickets.length + 1).padStart(3, "0")}`;
}

function responderTicket(id) {
    const ticket = obtenerTickets().find(item => item.id === id);
    if (!ticket) return;

    prepararModalRespuesta("editar");
    document.getElementById("respuestaId").value = ticket.id;
    document.getElementById("respuestaTicketId").textContent = ticket.id;
    document.getElementById("respuestaTitulo").textContent = `Responder a ${ticket.nombre}`;
    document.getElementById("respuestaResumen").textContent = `${ticket.area} - ${ticket.asunto}`;
    document.getElementById("respuestaTexto").value = ticket.respuesta || "";

    document.getElementById("modalRespuesta").hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("respuestaTexto").focus();
}

function verRespuesta(id) {
    const ticket = obtenerTickets().find(item => item.id === id);
    if (!ticket || !ticket.respuesta) return;

    prepararModalRespuesta("lectura");
    document.getElementById("respuestaTicketId").textContent = ticket.id;
    document.getElementById("respuestaTitulo").textContent = `Respuesta de soporte`;
    document.getElementById("respuestaResumen").textContent = `${ticket.area} - ${ticket.asunto}`;
    document.getElementById("respuestaCompleta").textContent = ticket.respuesta;

    document.getElementById("modalRespuesta").hidden = false;
    document.body.classList.add("modal-open");
}

function verMensaje(id) {
    const ticket = obtenerTickets().find(item => item.id === id);
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

document.getElementById("formRespuesta").addEventListener("submit", event => {
    event.preventDefault();

    const id = document.getElementById("respuestaId").value;
    const respuesta = document.getElementById("respuestaTexto").value.trim();
    if (!respuesta) {
        mostrarNotificacion("Escribi una respuesta antes de enviarla.", "error");
        return;
    }

    const tickets = obtenerTickets().map(ticket => {
        if (ticket.id !== id) return ticket;
        return {
            ...ticket,
            respuesta: respuesta.trim(),
            estado: "Respondido"
        };
    });

    guardarTickets(tickets);
    cerrarModalRespuesta();
    configurarVista();
    renderizarTickets();
    mostrarNotificacion("Respuesta guardada correctamente.", "success");
});

document.querySelectorAll("[data-cerrar-respuesta]").forEach(elemento => {
    elemento.addEventListener("click", cerrarModalRespuesta);
});

document.addEventListener("keydown", event => {
    const modal = document.getElementById("modalRespuesta");
    if (event.key === "Escape" && !modal.hidden) cerrarModalRespuesta();
});

document.getElementById("formSoporte").addEventListener("submit", event => {
    event.preventDefault();

    const tickets = obtenerTickets();
    const nuevoTicket = {
        id: crearIdTicket(tickets),
        fecha: fechaHoy(),
        rol: rolAyuda,
        usuario: usuarioAyuda,
        nombre: document.getElementById("soporteNombre").value.trim(),
        correo: document.getElementById("soporteCorreo").value.trim(),
        asunto: document.getElementById("soporteAsunto").value.trim(),
        area: document.getElementById("soporteArea").value,
        detalle: document.getElementById("soporteDetalle").value.trim(),
        respuesta: "",
        estado: rolAyuda === "admin" ? "Nota interna" : "Abierto"
    };

    if (!nuevoTicket.nombre || !nuevoTicket.correo || !nuevoTicket.asunto || !nuevoTicket.detalle) {
        mostrarNotificacion("Completa todos los campos de soporte.", "error");
        return;
    }

    tickets.unshift(nuevoTicket);
    guardarTickets(tickets);
    event.target.reset();
    autollenarDatos();
    configurarVista();
    renderizarEncabezadoTickets();
    renderizarTickets();
    mostrarNotificacion("Consulta registrada correctamente.", "success");
});

configurarVista();
autollenarDatos();
renderizarEncabezadoTickets();
renderizarTickets();
