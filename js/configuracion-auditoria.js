function renderizarAuditoria() {
    const tbody = document.querySelector("#tablaAuditoria tbody");
    const registros = window.configuracionState.auditoria;
    if (!tbody) return;
    if (!registros.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Sin cambios registrados.</td></tr>`;
        return;
    }
    tbody.innerHTML = registros.map(registro => `
        <tr>
            <td>${escaparHtml(new Date(registro.creadoEn).toLocaleString("es-NI"))}</td>
            <td>${escaparHtml(registro.usuario)}</td>
            <td>${escaparHtml(registro.modulo)}</td>
            <td>${escaparHtml(registro.accion)}</td>
            <td>${escaparHtml(registro.descripcion)}</td>
        </tr>
    `).join("");
}

async function cargarAuditoria() {
    const datos = await apiJson("/usuarios/admin/auditoria/");
    window.configuracionState.auditoria = datos.registros || [];
    renderizarAuditoria();
}
