const campos = {
    nombres: document.getElementById("nombres"),
    apellidos: document.getElementById("apellidos"),
    email: document.getElementById("email"),
    telefono: document.getElementById("telefono"),
    password: document.getElementById("password"),
    confirmPassword: document.getElementById("confirmPassword")
};

const ayudas = {
    nombres: document.getElementById("nombresHelp"),
    apellidos: document.getElementById("apellidosHelp"),
    email: document.getElementById("emailHelp"),
    telefono: document.getElementById("telefonoHelp"),
    password: document.getElementById("passwordHelp"),
    confirmPassword: document.getElementById("confirmPasswordHelp"),
    strength: document.getElementById("strengthText")
};

const toggle = document.querySelector(".toggle");
const registerButton = document.querySelector(".btn-login");
const strengthMeter = document.querySelector(".strength-meter");

function mostrarMensaje(elemento, mensaje, clase) {
    if (!elemento) return;
    elemento.textContent = mensaje;
    elemento.className = clase;
}

function marcarCampo(input, valido) {
    const grupo = input?.closest(".input-group");
    if (!grupo) return;

    grupo.classList.remove("field-valid", "field-invalid");
    if (input.value.trim() === "") return;

    grupo.classList.add(valido ? "field-valid" : "field-invalid");
}

function evaluarPassword(valor) {
    let puntos = 0;
    if (valor.length >= 8) puntos++;
    if (/[A-Z]/.test(valor) && /[a-z]/.test(valor)) puntos++;
    if (/\d/.test(valor)) puntos++;
    if (/[^A-Za-z0-9]/.test(valor)) puntos++;

    if (valor.length === 0) return { nivel: "", texto: "", valido: false };
    if (puntos <= 1) return { nivel: "weak", texto: "Contrase\u00f1a d\u00e9bil", valido: false };
    if (puntos <= 3) return { nivel: "medium", texto: "Contrase\u00f1a media", valido: valor.length >= 8 };
    return { nivel: "strong", texto: "Contrase\u00f1a fuerte", valido: true };
}

function actualizarFortaleza() {
    const resultado = evaluarPassword(campos.password.value);

    strengthMeter?.classList.remove("weak", "medium", "strong");
    if (resultado.nivel) {
        strengthMeter?.classList.add(resultado.nivel);
    }

    mostrarMensaje(
        ayudas.strength,
        resultado.texto,
        resultado.nivel === "weak" ? "error" : resultado.nivel ? "success" : ""
    );

    const passwordValida = campos.password.value.length >= 8;
    marcarCampo(campos.password, passwordValida);
    mostrarMensaje(
        ayudas.password,
        passwordValida || campos.password.value.length === 0 ? "" : "Debes ingresar al menos 8 caracteres",
        passwordValida ? "success" : "error"
    );

    validarConfirmacion();
}

function validarNombre(campo, ayuda, etiqueta) {
    const valido = campo.value.trim().length >= 2;
    marcarCampo(campo, valido);
    mostrarMensaje(ayuda, campo.value.trim() && !valido ? `${etiqueta} debe tener al menos 2 letras` : "", valido ? "success" : "error");
    return valido;
}

function validarCorreo() {
    const valor = campos.email.value.trim();
    const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
    marcarCampo(campos.email, valido);
    mostrarMensaje(ayudas.email, valor && !valido ? "Ingresa un correo v\u00e1lido" : "", valido ? "success" : "error");
    return valido;
}

function validarTelefono() {
    const valor = campos.telefono.value.trim();
    const valido = /^[0-9+\-\s()]{8,}$/.test(valor);
    marcarCampo(campos.telefono, valido);
    mostrarMensaje(ayudas.telefono, valor && !valido ? "Ingresa un tel\u00e9fono v\u00e1lido" : "", valido ? "success" : "error");
    return valido;
}

function validarConfirmacion() {
    const valor = campos.confirmPassword.value;
    const valido = valor.length > 0 && valor === campos.password.value;
    marcarCampo(campos.confirmPassword, valido);
    mostrarMensaje(ayudas.confirmPassword, valor && !valido ? "Las contrase\u00f1as no coinciden" : "", valido ? "success" : "error");
    return valido;
}

function obtenerUsuarios() {
    try {
        return JSON.parse(localStorage.getItem("tecnitrackUsuarios")) || [];
    } catch {
        return [];
    }
}

function guardarUsuario() {
    const correo = campos.email.value.trim().toLowerCase();
    const usuarios = obtenerUsuarios();
    const usuario = correo.split("@")[0].replace(/[^a-z0-9._-]/gi, "") || correo;

    if (usuarios.some(item => item.correo?.toLowerCase() === correo || item.usuario === usuario)) {
        mostrarNotificacion("Este correo ya est\u00e1 registrado.", "error");
        return false;
    }

    usuarios.push({
        usuario,
        nombre: `${campos.nombres.value.trim()} ${campos.apellidos.value.trim()}`,
        correo,
        telefono: campos.telefono.value.trim(),
        rol: "cliente",
        password: campos.password.value,
        activo: true
    });

    localStorage.setItem("tecnitrackUsuarios", JSON.stringify(usuarios));
    return true;
}

if (toggle && campos.password) {
    toggle.addEventListener("click", () => {
        const mostrarPassword = campos.password.type === "password";
        campos.password.type = mostrarPassword ? "text" : "password";
        toggle.classList.replace(
            mostrarPassword ? "fa-eye-slash" : "fa-eye",
            mostrarPassword ? "fa-eye" : "fa-eye-slash"
        );
    });
}

campos.nombres?.addEventListener("input", () => validarNombre(campos.nombres, ayudas.nombres, "Nombres"));
campos.apellidos?.addEventListener("input", () => validarNombre(campos.apellidos, ayudas.apellidos, "Apellidos"));
campos.email?.addEventListener("input", validarCorreo);
campos.telefono?.addEventListener("input", validarTelefono);
campos.password?.addEventListener("input", actualizarFortaleza);
campos.confirmPassword?.addEventListener("input", validarConfirmacion);

if (registerButton) {
    registerButton.addEventListener("click", (e) => {
        e.preventDefault();

        const formularioValido = [
            validarNombre(campos.nombres, ayudas.nombres, "Nombres"),
            validarNombre(campos.apellidos, ayudas.apellidos, "Apellidos"),
            validarCorreo(),
            validarTelefono(),
            campos.password.value.length >= 8,
            validarConfirmacion()
        ].every(Boolean);

        actualizarFortaleza();

        if (!formularioValido) {
            mostrarNotificacion("Revisa los campos marcados antes de registrarte.", "error");
            return;
        }

        if (!guardarUsuario()) return;

        mostrarNotificacion("Cuenta creada correctamente. Ya puedes iniciar sesi\u00f3n.", "success");
        setTimeout(() => {
            window.location.href = "index.html";
        }, 900);
    });
}
