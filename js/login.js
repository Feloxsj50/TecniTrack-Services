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
            alert("Completa todos los campos");
            return;
        }

        if (user === "admin" && pass === "admin123") {
            window.location.href = "panel_admin.html";
        } else if (user === "tecnico" && pass === "tec123") {
            window.location.href = "panel_tecnico.html";
        } else if (user === "cliente" && pass === "cli123") {
            window.location.href = "panel_cliente.html";
        } else {
            alert("Usuario o contraseña incorrectos");
        }
    });
}


