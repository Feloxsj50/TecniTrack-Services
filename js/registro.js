const password = document.getElementById("password");
const passwordHelp = document.getElementById("passwordHelp");
const toggle = document.querySelector(".toggle");
const email = document.getElementById("email");
const emailHelp = document.getElementById("emailHelp");
const registerButton = document.querySelector(".btn-login");
const radios = document.querySelectorAll('input[name="role"]');

function mostrarMensaje(elemento, mensaje, clase) {
    if (!elemento) return;
    elemento.textContent = mensaje;
    elemento.className = clase;
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

if (password) {
    password.addEventListener("input", () => {
        if (password.value.length === 0) {
            mostrarMensaje(passwordHelp, "", "");
        } else if (password.value.length < 8) {
            mostrarMensaje(passwordHelp, "La contraseña debe tener mínimo 8 caracteres", "error");
        } else {
            mostrarMensaje(passwordHelp, "Contraseña válida", "success");
        }
    });
}

if (email) {
    email.addEventListener("input", () => {
        const valor = email.value.trim();

        if (valor.length === 0) {
            mostrarMensaje(emailHelp, "", "");
        } else if (!valor.includes("@")) {
            mostrarMensaje(emailHelp, "El correo debe contener @", "error");
        } else {
            mostrarMensaje(emailHelp, "Correo válido", "success");
        }
    });
}

radios.forEach(radio => {
    radio.addEventListener("click", function () {
        if (this.classList.contains("activo")) {
            this.checked = false;
            this.classList.remove("activo");
        } else {
            radios.forEach(r => r.classList.remove("activo"));
            this.classList.add("activo");
        }
    });
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".role-group")) {
        radios.forEach(radio => {
            radio.checked = false;
            radio.classList.remove("activo");
        });
    }
});

if (registerButton) {
    registerButton.addEventListener("click", (e) => {
        e.preventDefault();

        const correoValido = email.value.trim().includes("@");
        const passwordValida = password.value.trim().length >= 8;

        if (!correoValido) {
            mostrarMensaje(emailHelp, "El correo debe contener @", "error");
            return;
        }

        if (!passwordValida) {
            mostrarMensaje(passwordHelp, "Debes ingresar al menos 8 caracteres", "error");
            return;
        }

        alert("Registro validado correctamente");
        window.location.href = "index.html";
    });
}


