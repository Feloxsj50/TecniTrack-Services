function nombreRol(rol) {
    return { admin: "Admin", tecnico: "Tecnico", cliente: "Cliente" }[rol] || rol;
}

function renderizarUsuarios() {
    const tbody = document.querySelector("#tablaUsuariosConfig tbody");
    const state = window.configuracionState;
    document.getElementById("totalUsuarios").textContent = state.usuarios.length;

    if (!state.usuarios.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state"><i class="fa-solid fa-users"></i><strong>Sin usuarios registrados</strong><span>Cuando se registren clientes o admin cree tecnicos, apareceran aqui.</span></div></td></tr>`;
        return;
    }

    tbody.innerHTML = obtenerPagina(state.usuarios, state.paginaUsuarios).map(usuario => `
        <tr>
            <td>${escaparHtml(usuario.username)}</td>
            <td>${escaparHtml(usuario.nombre)}</td>
            <td>${escaparHtml(nombreRol(usuario.rol))}</td>
            <td>${escaparHtml(usuario.email)}</td>
            <td><span class="estado ${usuario.activo ? "completado" : "pendiente"}">${usuario.activo ? "Activo" : "Inactivo"}</span></td>
            <td><div class="table-actions">
                <button type="button" class="btn-editar-historial" data-toggle="${usuario.id}" ${usuario.rol === "admin" ? "disabled" : ""}>
                    <i class="fa-solid ${usuario.activo ? "fa-user-slash" : "fa-user-check"}></i> ${usuario.activo ? "Desactivar" : "Activar"}
                </button>
                <button type="button" class="btn-editar-historial" data-reset="${usuario.id}"><i class="fa-solid fa-key"></i> Reset</button>
            </div></td>
        </tr>
    `).join("");

    tbody.querySelectorAll("[data-toggle]").forEach(button => button.addEventListener("click", () => cambiarEstadoUsuario(Number(button.dataset.toggle))));
    tbody.querySelectorAll("[data-reset]").forEach(button => button.addEventListener("click", () => resetearPassword(Number(button.dataset.reset))));
    renderizarPaginacion("paginacionUsuarios", state.usuarios.length, state.paginaUsuarios, pagina => {
        state.paginaUsuarios = pagina;
        renderizarUsuarios();
    });
}

async function cargarUsuarios() {
    const datos = await apiJson("/usuarios/admin/usuarios/");
    window.configuracionState.usuarios = datos.usuarios || [];
    window.configuracionState.paginaUsuarios = 1;
    renderizarUsuarios();
}

async function cambiarEstadoUsuario(usuarioId) {
    const usuario = window.configuracionState.usuarios.find(item => item.id === usuarioId);
    if (!usuario) return;
    try {
        await apiJson(`/usuarios/admin/usuarios/${usuarioId}/estado/`, { method: "POST", body: JSON.stringify({ activo: !usuario.activo }) });
        await Promise.all([cargarUsuarios(), cargarAuditoria()]);
        window.configuracionState.backup = null;
        mostrarNotificacion("Estado del usuario actualizado.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo actualizar el usuario.", "error");
    }
}

async function resetearPassword(usuarioId) {
    const usuario = window.configuracionState.usuarios.find(item => item.id === usuarioId);
    if (!usuario) return;
    const password = window.prompt(`Nueva contrasena temporal para ${usuario.username}:`);
    if (password === null) return;
    if (password.length < 8) {
        mostrarNotificacion("La contrasena temporal debe tener al menos 8 caracteres.", "error");
        return;
    }
    try {
        await apiJson(`/usuarios/admin/usuarios/${usuarioId}/password/`, { method: "POST", body: JSON.stringify({ password }) });
        await cargarAuditoria();
        mostrarNotificacion("Contrasena temporal actualizada correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo resetear la contrasena.", "error");
    }
}

function actualizarResumenConfiguracion() {
    document.getElementById("estadoDatos").textContent = "Django";
    document.getElementById("totalTickets").textContent = "0";
}
