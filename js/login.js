const usuario = document.getElementById("usuario");
const password = document.getElementById("password");
const toggle = document.querySelector(".toggle");
const loginButton = document.querySelector(".btn-login");
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

if (toggle && password) {
    toggle.addEventListener("click", () => {
        const mostrarPassword = password.type === "password";
        password.type = mostrarPassword ? "text" : "password";
        toggle.classList.replace(
            mostrarPassword ? "fa-eye-slash" : "fa-eye",
            mostrarPassword ? "fa-eye" : "fa-eye-slash"
        );
    });
}

if (loginButton) {
    loginButton.addEventListener("click", async (e) => {
        e.preventDefault();

        const user = usuario.value.trim();
        const pass = password.value.trim();

        if (!user || !pass) {
            mostrarNotificacion("Completa todos los campos", "error");
            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = "Entrando...";

        try {
            const token = await obtenerCsrfToken();
            const respuesta = await fetch(`${API_BASE}/usuarios/login/`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", "X-CSRFToken": token },
                body: JSON.stringify({ usuario: user, password: pass })
            });

            const datos = await leerRespuestaJson(respuesta);

            if (!respuesta.ok || !datos.ok) {
                mostrarNotificacion(datos.error || "Usuario o contraseña incorrectos", "error");
                return;
            }

            const usuarioBackend = datos.usuario;
            TecniAuth.iniciarSesion(usuarioBackend.rol, usuarioBackend.username, usuarioBackend);
            window.location.replace(TecniAuth.paginaInicio(usuarioBackend.rol));
        } catch (error) {
            mostrarNotificacion("No se pudo conectar con Django. Inicia el servidor backend.", "error");
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = "Entrar";
        }
    });
}


