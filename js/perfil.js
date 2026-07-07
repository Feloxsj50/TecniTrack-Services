const API_BASE = "http://127.0.0.1:8000";
let perfilActual = null;
let csrfToken = "";

function obtenerIniciales(nombre) {
    return nombre.split(" ").filter(Boolean).slice(0, 2).map(parte => parte[0].toUpperCase()).join("");
}

function nombreRol(rol) {
    return { admin: "Administrador", tecnico: "Tecnico", cliente: "Cliente" }[rol] || "Usuario";
}

function panelRol(rol) {
    return { admin: "Dashboard", tecnico: "Mi Panel", cliente: "Mi Panel" }[rol] || "Panel";
}

function permisosRol(rol) {
    return {
        admin: "Completos",
        tecnico: "Trabajos asignados",
        cliente: "Solicitudes y recibos"
    }[rol] || "Basicos";
}

function telefonoValido(telefono) {
    return /^\d{4}-\d{4}$/.test(telefono);
}

function correoValido(correo) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function formatearTelefono(input) {
    const digitos = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = digitos.length > 4 ? `${digitos.slice(0, 4)}-${digitos.slice(4)}` : digitos;
}

async function leerRespuestaJson(respuesta) {
    const texto = await respuesta.text();
    try {
        return JSON.parse(texto);
    } catch {
        return {
            ok: false,
            error: respuesta.status === 403
                ? "No se pudo validar la seguridad de Django. Inicia sesion nuevamente desde http://127.0.0.1:8000/."
                : "Django devolvio una respuesta no valida."
        };
    }
}

async function obtenerCsrfToken() {
    if (csrfToken) return csrfToken;

    const respuesta = await fetch(`${API_BASE}/usuarios/csrf/`, {
        credentials: "include"
    });
    const datos = await leerRespuestaJson(respuesta);

    if (!respuesta.ok || !datos.ok) {
        throw new Error(datos.error || "No se pudo preparar la seguridad de Django.");
    }

    csrfToken = datos.csrfToken;
    return csrfToken;
}

async function cargarPerfil() {
    try {
        const respuesta = await fetch(`${API_BASE}/usuarios/me/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo cargar el perfil.");

        perfilActual = datos.usuario;
        pintarPerfil(perfilActual);
    } catch (error) {
        mostrarNotificacion(error.message || "Inicia sesion nuevamente.", "error");
    }
}

function etiquetaAreaPerfil(perfil) {
    return perfil.rol === "cliente" ? "Cliente" : (perfil.area || nombreRol(perfil.rol));
}

function pintarPerfil(perfil) {
    const areaVisible = etiquetaAreaPerfil(perfil);

    document.getElementById("perfilIniciales").textContent = obtenerIniciales(perfil.nombre);
    document.getElementById("perfilNombre").textContent = perfil.nombre;
    document.getElementById("perfilRol").textContent = nombreRol(perfil.rol);
    document.getElementById("perfilUsuario").textContent = perfil.username;
    document.getElementById("perfilCorreo").textContent = perfil.email;
    document.getElementById("perfilTelefono").textContent = perfil.telefono || "Sin telefono";
    document.getElementById("perfilArea").textContent = areaVisible;
    document.getElementById("perfilPanel").textContent = panelRol(perfil.rol);
    document.getElementById("perfilPermisos").textContent = permisosRol(perfil.rol);

    document.getElementById("nombrePerfil").value = perfil.nombre;
    document.getElementById("correoPerfil").value = perfil.email;
    document.getElementById("telefonoPerfil").value = perfil.telefono || "";
    document.getElementById("areaPerfil").value = areaVisible;
    document.getElementById("areaPerfil").readOnly = true;
}

async function actualizarPerfil() {
    const nombre = document.getElementById("nombrePerfil").value.trim();
    const email = document.getElementById("correoPerfil").value.trim().toLowerCase();
    const telefono = document.getElementById("telefonoPerfil").value.trim();

    if (!nombre || !email || !telefono) return mostrarNotificacion("Completa nombre, correo y telefono.", "error");
    if (!correoValido(email)) return mostrarNotificacion("Ingresa un correo valido.", "error");
    if (!telefonoValido(telefono)) return mostrarNotificacion("Ingresa un telefono valido con formato 7777-8888.", "error");

    const token = await obtenerCsrfToken();
    const respuesta = await fetch(`${API_BASE}/usuarios/perfil/actualizar/`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": token
        },
        body: JSON.stringify({ nombre, email, telefono })
    });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo actualizar el perfil.");

    perfilActual = datos.usuario;
    pintarPerfil(perfilActual);
    mostrarNotificacion("Perfil actualizado correctamente.", "success");
}

async function cambiarPassword() {
    const actual = document.getElementById("passwordActual").value;
    const nueva = document.getElementById("passwordNueva").value;
    const confirmacion = document.getElementById("passwordConfirmar").value;

    if (!actual || !nueva || !confirmacion) return mostrarNotificacion("Completa todos los campos de contrasena.", "error");
    if (nueva.length < 8) return mostrarNotificacion("La nueva contrasena debe tener al menos 8 caracteres.", "error");
    if (nueva !== confirmacion) return mostrarNotificacion("La nueva contrasena y la confirmacion no coinciden.", "error");

    const token = await obtenerCsrfToken();
    const respuesta = await fetch(`${API_BASE}/usuarios/password/cambiar/`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": token
        },
        body: JSON.stringify({ actual, nueva, confirmacion })
    });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo cambiar la contrasena.");

    document.getElementById("passwordActual").value = "";
    document.getElementById("passwordNueva").value = "";
    document.getElementById("passwordConfirmar").value = "";
    mostrarNotificacion("Contrasena actualizada correctamente.", "success");
}

document.getElementById("btnGuardarPerfil").addEventListener("click", async () => {
    try { await actualizarPerfil(); } catch (error) { mostrarNotificacion(error.message, "error"); }
});

document.getElementById("btnCambiarPassword").addEventListener("click", async () => {
    try { await cambiarPassword(); } catch (error) { mostrarNotificacion(error.message, "error"); }
});

document.getElementById("telefonoPerfil")?.addEventListener("input", event => formatearTelefono(event.target));

cargarPerfil();


