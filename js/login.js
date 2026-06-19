const usuario = document.getElementById("usuario");
const password = document.getElementById("password");
const toggle = document.querySelector(".toggle");
const loginButton = document.querySelector(".btn-login");

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
    loginButton.addEventListener("click", (e) => {
        e.preventDefault();

        const user = usuario.value.trim();
        const pass = password.value.trim();

        if (!user || !pass) {
            mostrarNotificacion("Completa todos los campos");
            return;
        }

        if (user === "admin" && pass === "admin123") {
            TecniAuth.iniciarSesion("admin", user);
            window.location.replace(TecniAuth.paginaInicio("admin"));
        } else if (user === "tecnico" && pass === "tec123") {
            TecniAuth.iniciarSesion("tecnico", user);
            window.location.replace(TecniAuth.paginaInicio("tecnico"));
        } else if (user === "cliente" && pass === "cli123") {
            TecniAuth.iniciarSesion("cliente", user);
            window.location.replace(TecniAuth.paginaInicio("cliente"));
        } else {
            mostrarNotificacion("Usuario o contraseña incorrectos");
        }
    });
}



