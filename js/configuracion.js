const STORAGE_TALLER = "tecnitrackTaller";
const STORAGE_USUARIOS = "tecnitrackUsuarios";
const STORAGE_TICKETS = "tecnitrackTicketsSoporte";
const STORAGE_SOLICITUDES = "tecnitrackSolicitudes";

const tallerDefault = {
    nombre: "TecniTrack Services",
    correo: "soporte@tecnitrack.com",
    direccion: "Managua",
    telefono: "8888-0000",
    whatsapp: "8888-0000",
    horario: "Lun-Sab"
};

const usuariosDefault = [
    { usuario: "admin", nombre: "Administrador TecniTrack", rol: "admin", correo: "admin@tecnitrack.com", activo: true },
    { usuario: "tecnico", nombre: "Tecnico TecniTrack", rol: "tecnico", correo: "tecnico@tecnitrack.com", activo: true },
    { usuario: "cliente", nombre: "Cliente TecniTrack", rol: "cliente", correo: "cliente@email.com", activo: true }
];

function leerJson(clave, fallback) {
    try {
        return JSON.parse(localStorage.getItem(clave)) || fallback;
    } catch {
        return fallback;
    }
}

function guardarJson(clave, valor) {
    localStorage.setItem(clave, JSON.stringify(valor));
}

function inicializarDatos() {
    if (!localStorage.getItem(STORAGE_TALLER)) guardarJson(STORAGE_TALLER, tallerDefault);
    if (!localStorage.getItem(STORAGE_USUARIOS)) guardarJson(STORAGE_USUARIOS, usuariosDefault);
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function cargarTaller() {
    const taller = leerJson(STORAGE_TALLER, tallerDefault);
    document.getElementById("nombreTaller").value = taller.nombre;
    document.getElementById("correoTaller").value = taller.correo;
    document.getElementById("direccionTaller").value = taller.direccion;
    document.getElementById("telefonoTaller").value = taller.telefono;
    document.getElementById("whatsappTaller").value = taller.whatsapp;
    document.getElementById("horarioTaller").value = taller.horario;
}

function renderizarUsuarios() {
    const usuarios = leerJson(STORAGE_USUARIOS, usuariosDefault);
    const tbody = document.querySelector("#tablaUsuariosConfig tbody");

    document.getElementById("totalUsuarios").textContent = usuarios.length;
    tbody.innerHTML = usuarios.map(usuario => `
        <tr>
            <td>${escaparHtml(usuario.usuario)}</td>
            <td>${escaparHtml(usuario.nombre)}</td>
            <td>${escaparHtml(usuario.rol)}</td>
            <td>${escaparHtml(usuario.correo)}</td>
            <td><span class="estado ${usuario.activo ? "completado" : "pendiente"}">${usuario.activo ? "Activo" : "Inactivo"}</span></td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-editar-historial" data-toggle="${usuario.usuario}">
                        <i class="fa-solid ${usuario.activo ? "fa-user-slash" : "fa-user-check"}"></i>
                        ${usuario.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button type="button" class="btn-editar-historial" data-reset="${usuario.usuario}">
                        <i class="fa-solid fa-key"></i> Reset
                    </button>
                </div>
            </td>
        </tr>
    `).join("");

    tbody.querySelectorAll("[data-toggle]").forEach(boton => {
        boton.addEventListener("click", () => cambiarEstadoUsuario(boton.dataset.toggle));
    });

    tbody.querySelectorAll("[data-reset]").forEach(boton => {
        boton.addEventListener("click", () => resetearPassword(boton.dataset.reset));
    });
}

function actualizarResumen() {
    const tickets = leerJson(STORAGE_TICKETS, []);
    document.getElementById("totalTickets").textContent = tickets.length;
    document.getElementById("estadoDatos").textContent = "Local";
}

function cambiarEstadoUsuario(usuarioId) {
    const usuarios = leerJson(STORAGE_USUARIOS, usuariosDefault).map(usuario => {
        if (usuario.usuario !== usuarioId) return usuario;
        return { ...usuario, activo: !usuario.activo };
    });

    guardarJson(STORAGE_USUARIOS, usuarios);
    renderizarUsuarios();
    mostrarNotificacion("Estado del usuario actualizado.", "success");
}

function resetearPassword(usuarioId) {
    const resets = leerJson("tecnitrackResetsPassword", []);
    resets.unshift({
        usuario: usuarioId,
        fecha: new Date().toISOString()
    });
    guardarJson("tecnitrackResetsPassword", resets);
    mostrarNotificacion(`Reset de contraseña registrado para ${usuarioId}.`, "success");
}

function exportarBackup() {
    const backup = {
        generadoEn: new Date().toISOString(),
        taller: leerJson(STORAGE_TALLER, tallerDefault),
        usuarios: leerJson(STORAGE_USUARIOS, usuariosDefault),
        solicitudes: leerJson(STORAGE_SOLICITUDES, []),
        tickets: leerJson(STORAGE_TICKETS, []),
        resetsPassword: leerJson("tecnitrackResetsPassword", [])
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `tecnitrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    enlace.click();
    URL.revokeObjectURL(url);
    mostrarNotificacion("Respaldo JSON exportado correctamente.", "success");
}

document.getElementById("formTaller").addEventListener("submit", event => {
    event.preventDefault();

    const taller = {
        nombre: document.getElementById("nombreTaller").value.trim(),
        correo: document.getElementById("correoTaller").value.trim(),
        direccion: document.getElementById("direccionTaller").value.trim(),
        telefono: document.getElementById("telefonoTaller").value.trim(),
        whatsapp: document.getElementById("whatsappTaller").value.trim(),
        horario: document.getElementById("horarioTaller").value.trim()
    };

    if (Object.values(taller).some(valor => !valor)) {
        mostrarNotificacion("Completa todos los datos del taller.", "error");
        return;
    }

    guardarJson(STORAGE_TALLER, taller);
    mostrarNotificacion("Datos del taller guardados correctamente.", "success");
});

document.getElementById("btnExportarBackup").addEventListener("click", exportarBackup);

inicializarDatos();
cargarTaller();
renderizarUsuarios();
actualizarResumen();
