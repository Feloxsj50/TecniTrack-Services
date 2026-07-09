const API_BASE = window.location.origin;
let csrfToken = "";
let usuariosConfig = [];

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

async function apiJson(url, opciones = {}) {
    const respuesta = await fetch(`${API_BASE}${url}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": await obtenerCsrfToken(),
            ...(opciones.headers || {})
        },
        ...opciones
    });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo completar la accion.");
    return datos;
}

function telefonoValido(telefono) {
    return /^\d{4}-\d{4}$/.test(telefono);
}

function formatearTelefono(input) {
    const digitos = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = digitos.length > 4 ? `${digitos.slice(0, 4)}-${digitos.slice(4)}` : digitos;
}

function cargarFormularioTaller(taller) {
    document.getElementById("nombreTaller").value = taller.nombre || "";
    document.getElementById("correoTaller").value = taller.correo || "";
    document.getElementById("direccionTaller").value = taller.direccion || "";
    document.getElementById("telefonoTaller").value = taller.telefono || "";
    document.getElementById("whatsappTaller").value = taller.whatsapp || "";
    document.getElementById("horarioTaller").value = taller.horario || "";
}

async function cargarTaller() {
    const datos = await apiJson("/usuarios/taller/");
    cargarFormularioTaller(datos.taller);
}

function nombreRol(rol) {
    return { admin: "Admin", tecnico: "Técnico", cliente: "Cliente" }[rol] || rol;
}

function renderizarUsuarios() {
    const tbody = document.querySelector("#tablaUsuariosConfig tbody");
    document.getElementById("totalUsuarios").textContent = usuariosConfig.length;

    if (!usuariosConfig.length) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fa-solid fa-users"></i>
                        <strong>Sin usuarios registrados</strong>
                        <span>Cuando se registren clientes o admin cree tecnicos, aparecerán aquí.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = usuariosConfig.map(usuario => `
        <tr>
            <td>${escaparHtml(usuario.username)}</td>
            <td>${escaparHtml(usuario.nombre)}</td>
            <td>${escaparHtml(nombreRol(usuario.rol))}</td>
            <td>${escaparHtml(usuario.email)}</td>
            <td><span class="estado ${usuario.activo ? "completado" : "pendiente"}">${usuario.activo ? "Activo" : "Inactivo"}</span></td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-editar-historial" data-toggle="${usuario.id}" ${usuario.rol === "admin" ? "disabled" : ""}>
                        <i class="fa-solid ${usuario.activo ? "fa-user-slash" : "fa-user-check"}"></i>
                        ${usuario.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button type="button" class="btn-editar-historial" data-reset="${usuario.id}">
                        <i class="fa-solid fa-key"></i> Reset
                    </button>
                </div>
            </td>
        </tr>
    `).join("");

    tbody.querySelectorAll("[data-toggle]").forEach(boton => {
        boton.addEventListener("click", () => cambiarEstadoUsuario(Number(boton.dataset.toggle)));
    });

    tbody.querySelectorAll("[data-reset]").forEach(boton => {
        boton.addEventListener("click", () => resetearPassword(Number(boton.dataset.reset)));
    });
}

async function cargarUsuarios() {
    const datos = await apiJson("/usuarios/admin/usuarios/");
    usuariosConfig = datos.usuarios || [];
    renderizarUsuarios();
}

function actualizarResumen() {
    document.getElementById("estadoDatos").textContent = "Django";
    document.getElementById("totalTickets").textContent = "0";
}

async function cambiarEstadoUsuario(usuarioId) {
    const usuario = usuariosConfig.find(item => item.id === usuarioId);
    if (!usuario) return;

    try {
        await apiJson(`/usuarios/admin/usuarios/${usuarioId}/estado/`, {
            method: "POST",
            body: JSON.stringify({ activo: !usuario.activo })
        });
        await cargarUsuarios();
        mostrarNotificacion("Estado del usuario actualizado.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo actualizar el usuario.", "error");
    }
}

async function resetearPassword(usuarioId) {
    const usuario = usuariosConfig.find(item => item.id === usuarioId);
    if (!usuario) return;

    const password = window.prompt(`Nueva contraseña temporal para ${usuario.username}:`);
    if (password === null) return;

    if (password.length < 8) {
        mostrarNotificacion("La contraseña temporal debe tener al menos 8 caracteres.", "error");
        return;
    }

    try {
        await apiJson(`/usuarios/admin/usuarios/${usuarioId}/password/`, {
            method: "POST",
            body: JSON.stringify({ password })
        });
        mostrarNotificacion("Contrasena temporal actualizada correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo resetear la contraseña.", "error");
    }
}

async function guardarTaller(event) {
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

    if (!telefonoValido(taller.telefono) || !telefonoValido(taller.whatsapp)) {
        mostrarNotificacion("Teléfono y WhatsApp deben tener formato 7777-8888.", "error");
        return;
    }

    try {
        const datos = await apiJson("/usuarios/taller/actualizar/", {
            method: "POST",
            body: JSON.stringify(taller)
        });
        cargarFormularioTaller(datos.taller);
        mostrarNotificacion("Datos del taller guardados correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudieron guardar los datos del taller.", "error");
    }
}

async function exportarBackup() {
    try {
        const datos = await apiJson("/usuarios/backup/");
        const blob = new Blob([JSON.stringify(datos.backup, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = `tecnitrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
        enlace.click();
        URL.revokeObjectURL(url);
        mostrarNotificacion("Respaldo JSON exportado correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo exportar el backup.", "error");
    }
}

function conectarEventos() {
    document.getElementById("formTaller").addEventListener("submit", guardarTaller);
    document.getElementById("btnExportarBackup").addEventListener("click", exportarBackup);
    document.getElementById("telefonoTaller")?.addEventListener("input", event => formatearTelefono(event.target));
    document.getElementById("whatsappTaller")?.addEventListener("input", event => formatearTelefono(event.target));
}

async function iniciarConfiguracion() {
    conectarEventos();
    actualizarResumen();
    try {
        await Promise.all([cargarTaller(), cargarUsuarios()]);
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo cargar configuracion.", "error");
    }
}

iniciarConfiguracion();
