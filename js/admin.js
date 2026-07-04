const STORAGE_KEY_SOLICITUDES = "tecnitrackSolicitudes";

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

function claseEstado(estado) {
    if (estado === "Completado") return "completado";
    if (estado === "En Proceso") return "en-proceso";
    return "pendiente";
}

function crearIdSolicitud(solicitudes) {
    return `SOL-${String(solicitudes.length + 1).padStart(3, "0")}`;
}

function actualizarCards() {
    const solicitudes = obtenerSolicitudes();
    const pendientes = solicitudes.filter(s => s.estado === "Pendiente");
    const proceso = solicitudes.filter(s => s.estado === "En Proceso");
    const completados = solicitudes.filter(s => s.estado === "Completado");

    document.getElementById("totalServicios").textContent = solicitudes.length;
    document.getElementById("serviciosPendientes").textContent = pendientes.length;
    document.getElementById("serviciosProceso").textContent = proceso.length;
    document.getElementById("serviciosCompletados").textContent = completados.length;
}

function cargarServicios() {
    const tabla = document.querySelector("#tablaServicios tbody");
    if (!tabla) return;

    const solicitudes = obtenerSolicitudes();
    tabla.innerHTML = "";

    if (!solicitudes.length) {
        tabla.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fa-solid fa-screwdriver-wrench"></i>
                        <strong>Sin solicitudes pendientes</strong>
                        <span>Cuando un cliente envie una solicitud, aparecera aqui para asignarla a un tecnico.</span>
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
            <td>${escaparHtml(solicitud.tecnico || "Sin asignar")}</td>
            <td><span class="estado ${claseEstado(solicitud.estado)}">${escaparHtml(solicitud.estado)}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn-editar-historial" type="button" data-editar="${solicitud.id}">
                        <i class="fa-solid fa-pen"></i> Editar
                    </button>
                </div>
            </td>
        `;
        tabla.appendChild(fila);
    });

    tabla.querySelectorAll("[data-editar]").forEach(boton => {
        boton.addEventListener("click", () => editarServicio(boton.dataset.editar));
    });
}

function limpiarFormulario() {
    document.getElementById("idEditar").value = "";
    document.getElementById("cliente").value = "";
    document.getElementById("dispositivo").value = "";
    document.getElementById("servicio").value = "";
    document.getElementById("fecha").value = "";
    document.getElementById("tecnicoServicio").value = "";
    document.getElementById("estadoServicio").value = "Pendiente";
    document.getElementById("tituloFormulario").textContent = "Solicitud de Servicio";
    document.getElementById("btnGuardar").textContent = "Guardar Servicio";
}

function editarServicio(id) {
    const solicitud = obtenerSolicitudes().find(item => item.id === id);
    if (!solicitud) return;

    document.getElementById("idEditar").value = solicitud.id;
    document.getElementById("cliente").value = solicitud.cliente;
    document.getElementById("dispositivo").value = solicitud.dispositivo;
    document.getElementById("servicio").value = solicitud.servicio;
    document.getElementById("fecha").value = solicitud.fecha;
    document.getElementById("tecnicoServicio").value = solicitud.tecnico || "";
    document.getElementById("estadoServicio").value = solicitud.estado;
    document.getElementById("tituloFormulario").textContent = "Asignar o actualizar solicitud";
    document.getElementById("btnGuardar").textContent = "Actualizar Solicitud";

    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("btnGuardar")?.addEventListener("click", () => {
    const idEditar = document.getElementById("idEditar").value;
    const cliente = document.getElementById("cliente").value.trim();
    const dispositivo = document.getElementById("dispositivo").value.trim();
    const servicio = document.getElementById("servicio").value.trim();
    const fecha = document.getElementById("fecha").value;
    const tecnico = document.getElementById("tecnicoServicio").value;
    const estadoManual = document.getElementById("estadoServicio").value;

    if (!cliente || !dispositivo || !servicio || !fecha) {
        mostrarNotificacion("Completa cliente, dispositivo, servicio y fecha.", "error");
        return;
    }

    let solicitudes = obtenerSolicitudes();

    if (idEditar) {
        solicitudes = solicitudes.map(solicitud => {
            if (solicitud.id !== idEditar) return solicitud;

            return {
                ...solicitud,
                cliente,
                dispositivo,
                servicio,
                fecha,
                tecnico,
                estado: tecnico && estadoManual === "Pendiente" ? "En Proceso" : estadoManual
            };
        });
        mostrarNotificacion("Solicitud actualizada correctamente.", "success");
    } else {
        solicitudes.unshift({
            id: crearIdSolicitud(solicitudes),
            cliente,
            dispositivo,
            servicio,
            fecha,
            tecnico,
            diagnostico: "",
            estado: tecnico ? "En Proceso" : "Pendiente",
            creadoEn: new Date().toISOString()
        });
        mostrarNotificacion("Solicitud creada correctamente.", "success");
    }

    guardarSolicitudes(solicitudes);
    limpiarFormulario();
    cargarServicios();
    actualizarCards();
});

cargarServicios();
actualizarCards();
