const CONFIG_API_BASE = (() => {
    const origin = window.location.origin;
    const localStaticPorts = ["5500", "5501", "5173"];

    if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
    if (localStaticPorts.includes(window.location.port)) {
        return window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
    }
    return origin;
})();

let configuracionCsrfToken = "";

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

async function obtenerCsrfConfiguracion() {
    if (configuracionCsrfToken) return configuracionCsrfToken;
    const respuesta = await fetch(`${CONFIG_API_BASE}/usuarios/csrf/`, { credentials: "include" });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo preparar la seguridad de Django.");
    configuracionCsrfToken = datos.csrfToken;
    return configuracionCsrfToken;
}

async function apiConfiguracion(url, opciones = {}) {
    const respuesta = await fetch(`${CONFIG_API_BASE}${url}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": await obtenerCsrfConfiguracion(),
            ...(opciones.headers || {}),
        },
        ...opciones,
    });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo completar la accion.");
    return datos;
}

const apiJson = apiConfiguracion;

function telefonoValido(telefono) {
    return /^\d{4}-\d{4}$/.test(telefono);
}

function formatearTelefono(input) {
    const digitos = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = digitos.length > 4 ? `${digitos.slice(0, 4)}-${digitos.slice(4)}` : digitos;
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
    const texto = Array.isArray(valor) || typeof valor === "object" ? JSON.stringify(valor) : String(valor);
    return `"${texto.replaceAll('"', '""')}"`;
}

function filasACsv(filas) {
    if (!filas?.length) return "\ufeffSin datos\n";
    const columnas = Object.keys(filas[0]);
    const encabezado = columnas.map(valorCsv).join(",");
    const cuerpo = filas.map(fila => columnas.map(columna => valorCsv(fila[columna])).join(",")).join("\n");
    return `\ufeff${encabezado}\n${cuerpo}\n`;
}
