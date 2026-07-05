const STORAGE_KEY_TICKETS = "tecnitrackTicketsSoporte";

const sesionAyuda = TecniAuth.obtenerSesion();
const rolAyuda = sesionAyuda?.rol || "cliente";
const usuarioAyuda = sesionAyuda?.usuario || rolAyuda;

const configuracionAyuda = {
    admin: {
        titulo: "Centro de Soporte del Sistema",
        principal: "Admin",
        principalTexto: "Vista General",
        ticketsTexto: "Tickets Totales",
        tiempo: "10m",
        formTitulo: "Registrar Nota Interna",
        boton: "Guardar Nota",
        areas: ["Sistema", "Usuarios", "Inventario", "Recibos", "Reportes"],
        ticketsTitulo: "Tickets abiertos por usuarios"
    },
    tecnico: {
        titulo: "Soporte Tecnico",
        principal: "Tec",
        principalTexto: "Mesa Interna",
        ticketsTexto: "Mis Tickets",
        tiempo: "15m",
        formTitulo: "Pedir Apoyo al Admin",
        boton: "Enviar Consulta",
        areas: ["Trabajo asignado", "Diagnostico", "Inventario", "Estado del servicio"],
        ticketsTitulo: "Mis tickets de soporte"
    },
    cliente: {
        titulo: "Soporte al Cliente",
        principal: "9-5",
        principalTexto: "Horario de Atencion",
        ticketsTexto: "Mis Tickets",
        tiempo: "20m",
        formTitulo: "Contactar al Taller",
        boton: "Enviar Consulta",
        areas: ["Solicitud de servicio", "Estado del equipo", "Recibo", "Cuenta de usuario"],
        ticketsTitulo: "Mis consultas"
    }
};

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

function configurarVista() {
    const config = configuracionAyuda[rolAyuda] || configuracionAyuda.cliente;
    const tickets = ticketsVisibles();

    document.getElementById("ayudaTitulo").textContent = config.titulo;
    document.getElementById("statPrincipal").textContent = config.principal;
    document.getElementById("statPrincipalTexto").textContent = config.principalTexto;
    document.getElementById("statCanal").textContent = "Web";
    document.getElementById("statTickets").textContent = tickets.length;
    document.getElementById("statTicketsTexto").textContent = config.ticketsTexto;
    document.getElementById("statTiempo").textContent = config.tiempo;
    document.getElementById("formTitulo").textContent = config.formTitulo;
    document.getElementById("btnSoporte").textContent = config.boton;
    document.getElementById("ticketsTitulo").textContent = config.ticketsTitulo;

    document.getElementById("soporteArea").innerHTML = config.areas
        .map(area => `<option value="${escaparHtml(area)}">${escaparHtml(area)}</option>`)
        .join("");
}

function renderizarTickets() {
    const tbody = document.querySelector("#tablaTickets tbody");
    const tickets = ticketsVisibles();

    if (!tickets.length) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fa-solid fa-headset"></i>
                        <strong>Sin tickets registrados</strong>
                        <span>Cuando se envie una consulta de soporte, aparecera aqui.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = tickets.map(ticket => `
        <tr>
            <td>${escaparHtml(ticket.fecha)}</td>
            <td>${escaparHtml(ticket.id)}</td>
            <td>${escaparHtml(ticket.nombre)}</td>
            <td>${escaparHtml(ticket.area)}</td>
            <td>${escaparHtml(ticket.asunto)}</td>
            <td><span class="estado en-proceso">${escaparHtml(ticket.estado)}</span></td>
        </tr>
    `).join("");
}

function crearIdTicket(tickets) {
    return `TK-${String(tickets.length + 1).padStart(3, "0")}`;
}

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
        estado: rolAyuda === "admin" ? "Nota interna" : "Abierto"
    };

    if (!nuevoTicket.nombre || !nuevoTicket.correo || !nuevoTicket.asunto || !nuevoTicket.detalle) {
        mostrarNotificacion("Completa todos los campos de soporte.", "error");
        return;
    }

    tickets.unshift(nuevoTicket);
    guardarTickets(tickets);
    event.target.reset();
    configurarVista();
    renderizarTickets();
    mostrarNotificacion("Consulta registrada correctamente.", "success");
});

configurarVista();
renderizarTickets();
