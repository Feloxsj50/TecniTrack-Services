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

async function guardarTaller(event) {
    event.preventDefault();
    const taller = Object.fromEntries([
        ["nombre", "nombreTaller"],
        ["correo", "correoTaller"],
        ["direccion", "direccionTaller"],
        ["telefono", "telefonoTaller"],
        ["whatsapp", "whatsappTaller"],
        ["horario", "horarioTaller"],
    ].map(([campo, id]) => [campo, document.getElementById(id).value.trim()]));

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
            body: JSON.stringify(taller),
        });
        cargarFormularioTaller(datos.taller);
        window.configuracionState.backup = null;
        mostrarNotificacion("Datos del taller guardados correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudieron guardar los datos del taller.", "error");
    }
}

function conectarEventosTaller() {
    document.getElementById("formTaller")?.addEventListener("submit", guardarTaller);
    document.getElementById("telefonoTaller")?.addEventListener("input", event => formatearTelefono(event.target));
    document.getElementById("whatsappTaller")?.addEventListener("input", event => formatearTelefono(event.target));
}
