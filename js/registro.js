const campos = {
    nombres: document.getElementById("nombres"),
    apellidos: document.getElementById("apellidos"),
    username: document.getElementById("username"),
    email: document.getElementById("email"),
    telefono: document.getElementById("telefono"),
    password: document.getElementById("password"),
    confirmPassword: document.getElementById("confirmPassword")
};

const ayudas = {
    nombres: document.getElementById("nombresHelp"),
    apellidos: document.getElementById("apellidosHelp"),
    username: document.getElementById("usernameHelp"),
    email: document.getElementById("emailHelp"),
    telefono: document.getElementById("telefonoHelp"),
    password: document.getElementById("passwordHelp"),
    confirmPassword: document.getElementById("confirmPasswordHelp"),
    strength: document.getElementById("strengthText")
};

const toggle = document.querySelector(".toggle");
const registerButton = document.querySelector(".btn-login");
const strengthMeter = document.querySelector(".strength-meter");
const API_BASE = "http://127.0.0.1:8000";

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

function validarUsername() {
    const valor = campos.username.value.trim();
    const valido = /^[a-zA-Z0-9._-]{4,30}$/.test(valor);
    marcarCampo(campos.username, valido);
    mostrarMensaje(
        ayudas.username,
        valor && !valido ? "Usa 4 a 30 caracteres: letras, números, punto, guion o guion bajo" : "",
        valido ? "success" : "error"
    );
    return valido;
}

function validarTelefono() {
    const valor = campos.telefono.value.trim();
    const valido = /^\d{4}-\d{4}$/.test(valor);
    marcarCampo(campos.telefono, valido);
    mostrarMensaje(ayudas.telefono, valor && !valido ? "Usa el formato 7777-8888" : "", valido ? "success" : "error");
    return valido;
}

function formatearTelefono(input) {
    const digitos = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = digitos.length > 4 ? `${digitos.slice(0, 4)}-${digitos.slice(4)}` : digitos;
}

function validarConfirmacion() {
    const valor = campos.confirmPassword.value;
    const valido = valor.length > 0 && valor === campos.password.value;
    marcarCampo(campos.confirmPassword, valido);
    mostrarMensaje(ayudas.confirmPassword, valor && !valido ? "Las contrase\u00f1as no coinciden" : "", valido ? "success" : "error");
    return valido;
}

async function registrarCliente() {
    const respuesta = await fetch(`${API_BASE}/usuarios/registro/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            nombres: campos.nombres.value.trim(),
            apellidos: campos.apellidos.value.trim(),
            username: campos.username.value.trim(),
            email: campos.email.value.trim().toLowerCase(),
            telefono: campos.telefono.value.trim(),
            password: campos.password.value,
            confirmPassword: campos.confirmPassword.value
        })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok || !datos.ok) {
        throw new Error(datos.error || "No se pudo crear la cuenta.");
    }

    return datos.usuario;
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
campos.username?.addEventListener("input", validarUsername);
campos.email?.addEventListener("input", validarCorreo);
campos.telefono?.addEventListener("input", () => {
    formatearTelefono(campos.telefono);
    validarTelefono();
});
campos.password?.addEventListener("input", actualizarFortaleza);
campos.confirmPassword?.addEventListener("input", validarConfirmacion);

if (registerButton) {
    registerButton.addEventListener("click", async (e) => {
        e.preventDefault();

        const formularioValido = [
            validarNombre(campos.nombres, ayudas.nombres, "Nombres"),
            validarNombre(campos.apellidos, ayudas.apellidos, "Apellidos"),
            validarUsername(),
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

        registerButton.disabled = true;
        registerButton.textContent = "Creando cuenta...";

        try {
            await registrarCliente();
            mostrarNotificacion("Cuenta de cliente creada correctamente. Ya puedes iniciar sesi\u00f3n.", "success");
            setTimeout(() => {
                window.location.href = "index.html";
            }, 900);
        } catch (error) {
            mostrarNotificacion(error.message || "No se pudo conectar con Django.", "error");
        } finally {
            registerButton.disabled = false;
            registerButton.textContent = "Registrarme";
        }
    });
}
