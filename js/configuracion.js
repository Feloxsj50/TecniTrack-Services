window.configuracionState = {
    usuarios: [],
    backup: null,
    paginaUsuarios: 1,
    auditoria: [],
};

async function iniciarConfiguracion() {
    conectarEventosTaller();
    conectarEventosBackup();
    actualizarResumenConfiguracion();

    try {
        await Promise.all([
            cargarTaller(),
            cargarUsuarios(),
            cargarResumenBackup(),
            cargarAuditoria(),
        ]);
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo cargar la configuracion.", "error");
    }
}

iniciarConfiguracion();
