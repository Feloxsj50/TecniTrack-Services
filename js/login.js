const usuario = document.getElementById("usuario");
const password = document.getElementById("password");
const toggle = document.querySelector(".toggle");
const loginButton = document.querySelector(".btn-login");
const API_BASE = "http://127.0.0.1:8000";

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
            const respuesta = await fetch(`${API_BASE}/usuarios/login/`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usuario: user, password: pass })
            });

            const datos = await respuesta.json();

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
