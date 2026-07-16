async function obtenerBackupCompleto() {
    if (window.configuracionState.backup) return window.configuracionState.backup;
    const datos = await apiJson("/usuarios/backup/");
    window.configuracionState.backup = datos.backup;
    pintarResumenBackup(datos.backup.resumen || {});
    return datos.backup;
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

async function exportarCsvPorModulo() {
    try {
        const backup = await obtenerBackupCompleto();
        const fecha = new Date().toISOString().slice(0, 10);
        ["usuarios", "clientes", "tecnicos", "servicios", "inventario", "facturas", "tickets"].forEach(modulo => {
            descargarArchivo(filasACsv(backup[modulo] || []), `tecnitrack-${modulo}-${fecha}.csv`, "text/csv;charset=utf-8;");
        });
        mostrarNotificacion("CSV por modulo exportado correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo exportar CSV.", "error");
    }
}

function conectarEventosBackup() {
    document.getElementById("btnExportarCsv")?.addEventListener("click", exportarCsvPorModulo);
}
