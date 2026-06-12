const perfiles = {
    admin: {
        nombre: "Administrador TecniTrack",
        rol: "Administrador",
        usuario: "admin",
        correo: "admin@tecnitrack.com",
        telefono: "8888-0000",
        area: "Administración",
        panel: "Dashboard",
        permisos: "Completos"
    },
    tecnico: {
        nombre: "Técnico TecniTrack",
        rol: "Técnico",
        usuario: "tecnico",
        correo: "tecnico@tecnitrack.com",
        telefono: "8888-1234",
        area: "Soporte técnico",
        panel: "Mi Panel",
        permisos: "Servicios e inventario"
    },
    cliente: {
        nombre: "Cliente TecniTrack",
        rol: "Cliente",
        usuario: "cliente",
        correo: "cliente@email.com",
        telefono: "7777-7777",
        area: "Cliente",
        panel: "Mi Panel",
        permisos: "Servicios y facturación"
    }
};

function obtenerRolActual() {
    return sessionStorage.getItem("rolActual") || "admin";
}

function obtenerIniciales(nombre) {
    return nombre
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map(parte => parte[0].toUpperCase())
        .join("");
}

function cargarPerfil() {
    const rol = obtenerRolActual();
    const perfil = perfiles[rol] || perfiles.admin;

    document.getElementById("perfilIniciales").textContent = obtenerIniciales(perfil.nombre);
    document.getElementById("perfilNombre").textContent = perfil.nombre;
    document.getElementById("perfilRol").textContent = perfil.rol;
    document.getElementById("perfilUsuario").textContent = perfil.usuario;
    document.getElementById("perfilCorreo").textContent = perfil.correo;
    document.getElementById("perfilTelefono").textContent = perfil.telefono;
    document.getElementById("perfilArea").textContent = perfil.area;
    document.getElementById("perfilPanel").textContent = perfil.panel;
    document.getElementById("perfilPermisos").textContent = perfil.permisos;

    document.getElementById("nombrePerfil").value = perfil.nombre;
    document.getElementById("correoPerfil").value = perfil.correo;
    document.getElementById("telefonoPerfil").value = perfil.telefono;
    document.getElementById("areaPerfil").value = perfil.area;
}

function correoValido(correo) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function telefonoValido(telefono) {
    return telefono.replace(/\D/g, "").length >= 8;
}

document.getElementById("btnGuardarPerfil").addEventListener("click", () => {
    const nombre = document.getElementById("nombrePerfil").value.trim();
    const correo = document.getElementById("correoPerfil").value.trim();
    const telefono = document.getElementById("telefonoPerfil").value.trim();
    const area = document.getElementById("areaPerfil").value.trim();

    if (!nombre || !correo || !telefono || !area) {
        mostrarNotificacion("Completa todos los campos del perfil.");
        return;
    }

    if (nombre.length < 3) {
        mostrarNotificacion("El nombre debe tener al menos 3 caracteres.");
        return;
    }

    if (!correoValido(correo)) {
        mostrarNotificacion("Ingresa un correo válido.");
        return;
    }

    if (!telefonoValido(telefono)) {
        mostrarNotificacion("Ingresa un teléfono válido de al menos 8 dígitos.");
        return;
    }

    const rol = obtenerRolActual();
    perfiles[rol] = {
        ...perfiles[rol],
        nombre,
        correo,
        telefono,
        area
    };

    cargarPerfil();
    mostrarNotificacion("Perfil actualizado correctamente.", "success");
});

cargarPerfil();
