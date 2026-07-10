const API_BASE = (() => {
    const origin = window.location.origin;
    const localStaticPorts = ["5500", "5501", "5173"];

    if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
    if (localStaticPorts.includes(window.location.port)) {
        return window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
    }

    return origin;
})();
let csrfToken = "";
let usuariosConfig = [];
let backupCache = null;

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
    return { admin: "Admin", tecnico: "Tecnico", cliente: "Cliente" }[rol] || rol;
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
                        <span>Cuando se registren clientes o admin cree tecnicos, apareceran aqui.</span>
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

function pintarResumenBackup(resumen = {}) {
    document.getElementById("backupUsuarios").textContent = resumen.usuarios || 0;
    document.getElementById("backupServicios").textContent = resumen.servicios || 0;
    document.getElementById("backupInventario").textContent = resumen.inventario || 0;
    document.getElementById("backupFacturas").textContent = resumen.facturas || 0;
    document.getElementById("backupTickets").textContent = resumen.tickets || 0;
    document.getElementById("totalTickets").textContent = resumen.tickets || 0;
}

async function cargarResumenBackup() {
    const datos = await apiJson("/usuarios/backup/?resumen=1");
    pintarResumenBackup(datos.resumen || {});
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
        backupCache = null;
        mostrarNotificacion("Estado del usuario actualizado.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo actualizar el usuario.", "error");
    }
}

async function resetearPassword(usuarioId) {
    const usuario = usuariosConfig.find(item => item.id === usuarioId);
    if (!usuario) return;

    const password = window.prompt(`Nueva contrasena temporal para ${usuario.username}:`);
    if (password === null) return;

    if (password.length < 8) {
        mostrarNotificacion("La contrasena temporal debe tener al menos 8 caracteres.", "error");
        return;
    }

    try {
        await apiJson(`/usuarios/admin/usuarios/${usuarioId}/password/`, {
            method: "POST",
            body: JSON.stringify({ password })
        });
        mostrarNotificacion("Contrasena temporal actualizada correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo resetear la contrasena.", "error");
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
        mostrarNotificacion("Telefono y WhatsApp deben tener formato 7777-8888.", "error");
        return;
    }

    try {
        const datos = await apiJson("/usuarios/taller/actualizar/", {
            method: "POST",
            body: JSON.stringify(taller)
        });
        cargarFormularioTaller(datos.taller);
        backupCache = null;
        mostrarNotificacion("Datos del taller guardados correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudieron guardar los datos del taller.", "error");
    }
}

function descargarArchivo(contenido, nombreArchivo, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(url);
}

function valorCsv(valor) {
    if (valor === null || valor === undefined) return "";
    const texto = Array.isArray(valor) || typeof valor === "object"
        ? JSON.stringify(valor)
        : String(valor);
    return `"${texto.replaceAll('"', '""')}"`;
}

function filasACsv(filas) {
    if (!filas?.length) return "Sin datos\n";
    const columnas = Object.keys(filas[0]);
    const encabezado = columnas.map(valorCsv).join(",");
    const cuerpo = filas.map(fila => columnas.map(columna => valorCsv(fila[columna])).join(",")).join("\n");
    return `${encabezado}\n${cuerpo}\n`;
}

async function obtenerBackupCompleto() {
    if (backupCache) return backupCache;
    const datos = await apiJson("/usuarios/backup/");
    backupCache = datos.backup;
    pintarResumenBackup(backupCache.resumen || {});
    return backupCache;
}

async function exportarBackup() {
    try {
        const backup = await obtenerBackupCompleto();
        descargarArchivo(
            JSON.stringify(backup, null, 2),
            `tecnitrack-backup-completo-${new Date().toISOString().slice(0, 10)}.json`,
            "application/json;charset=utf-8;"
        );
        mostrarNotificacion("Respaldo JSON completo exportado correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo exportar el backup.", "error");
    }
}

async function exportarCsvPorModulo() {
    try {
        const backup = await obtenerBackupCompleto();
        const fecha = new Date().toISOString().slice(0, 10);
        const modulos = ["usuarios", "clientes", "tecnicos", "servicios", "inventario", "facturas", "tickets"];

        modulos.forEach(modulo => {
            descargarArchivo(
                filasACsv(backup[modulo] || []),
                `tecnitrack-${modulo}-${fecha}.csv`,
                "text/csv;charset=utf-8;"
            );
        });

        mostrarNotificacion("CSV por modulo exportado correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo exportar CSV.", "error");
    }
}

function conectarEventos() {
    document.getElementById("formTaller").addEventListener("submit", guardarTaller);
    document.getElementById("btnExportarBackup").addEventListener("click", exportarBackup);
    document.getElementById("btnExportarCsv").addEventListener("click", exportarCsvPorModulo);
    document.getElementById("telefonoTaller")?.addEventListener("input", event => formatearTelefono(event.target));
    document.getElementById("whatsappTaller")?.addEventListener("input", event => formatearTelefono(event.target));
}

async function iniciarConfiguracion() {
    conectarEventos();
    actualizarResumen();
    try {
        await Promise.all([cargarTaller(), cargarUsuarios(), cargarResumenBackup()]);
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo cargar configuracion.", "error");
    }
}

iniciarConfiguracion();
