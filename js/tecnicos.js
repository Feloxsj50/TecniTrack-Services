const tablaTecnicos = document.querySelector("#tablaTecnicos tbody");
const totalTecnicos = document.getElementById("totalTecnicos");
const tecnicosActivos = document.getElementById("tecnicosActivos");
const tecnicosInactivos = document.getElementById("tecnicosInactivos");
const btnGuardarTecnico = document.getElementById("btnGuardarTecnico");
const buscarTecnico = document.getElementById("buscarTecnico");

const nombreTecnico = document.getElementById("nombreTecnico");
const usuarioTecnico = document.getElementById("usuarioTecnico");
const correoTecnico = document.getElementById("correoTecnico");
const especialidadTecnico = document.getElementById("especialidadTecnico");
const telefonoTecnico = document.getElementById("telefonoTecnico");
const passwordTecnico = document.getElementById("passwordTecnico");
const estadoTecnico = document.getElementById("estadoTecnico");

const API_BASE = window.location.origin;
let tecnicos = [];
let tecnicoEditandoId = null;

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function telefonoValido(telefono) {
    return /^\d{4}-\d{4}$/.test(telefono);
}

function correoValido(correo) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function usuarioValido(usuario) {
    return /^[A-Za-z0-9._-]{4,30}$/.test(usuario);
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
        return { ok: false, error: "Django devolvió una respuesta no válida. Revisa que la sesion admin este activa." };
    }
}

function actualizarResumen(lista = tecnicos) {
    const activos = lista.filter(t => t.estado === "Activo").length;
    const inactivos = lista.filter(t => t.estado !== "Activo").length;
    if (totalTecnicos) totalTecnicos.textContent = lista.length;
    if (tecnicosActivos) tecnicosActivos.textContent = activos;
    if (tecnicosInactivos) tecnicosInactivos.textContent = inactivos;
}

function renderizarTabla(lista) {
    tablaTecnicos.innerHTML = "";
    if (!lista.length) {
        tablaTecnicos.innerHTML = `
            <tr class="empty-row">
                <td colspan="7"><div class="empty-state"><strong>Sin técnicos registrados</strong><span>Registra técnicos usando el formulario de arriba.</span></div></td>
            </tr>`;
        return;
    }

    lista.forEach((tecnico) => {
        const claseEstado = tecnico.estado === "Activo" ? "activo" : "inactivo";
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${escaparHtml(tecnico.id)}</td>
            <td>${escaparHtml(tecnico.nombre)}<br><small>@${escaparHtml(tecnico.username)}</small></td>
            <td>${escaparHtml(tecnico.correo || "Sin correo")}</td>
            <td>${escaparHtml(tecnico.especialidad)}</td>
            <td>${escaparHtml(tecnico.telefono || "Sin teléfono")}</td>
            <td><span class="estado ${claseEstado}">${escaparHtml(tecnico.estado)}</span></td>
            <td>
                <button class="btn-editar" type="button" data-editar="${tecnico.id}"><i class="fa fa-pen"></i> Editar</button>
                <button class="btn-eliminar" type="button" data-eliminar="${tecnico.id}"><i class="fa fa-trash"></i> Eliminar</button>
            </td>`;
        tablaTecnicos.appendChild(tr);
    });

    tablaTecnicos.querySelectorAll("[data-editar]").forEach(boton => {
        boton.addEventListener("click", () => cargarTecnicoEnFormulario(Number(boton.dataset.editar)));
    });
    tablaTecnicos.querySelectorAll("[data-eliminar]").forEach(boton => {
        boton.addEventListener("click", () => eliminarTecnico(Number(boton.dataset.eliminar)));
    });
}

async function cargarTecnicos() {
    tablaTecnicos.innerHTML = `<tr class="empty-row"><td colspan="7">Cargando técnicos...</td></tr>`;
    try {
        const respuesta = await fetch(`${API_BASE}/tecnicos/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudieron cargar los técnicos.");
        tecnicos = datos.tecnicos;
        renderizarTabla(tecnicos);
        actualizarResumen(tecnicos);
    } catch (error) {
        tablaTecnicos.innerHTML = `<tr class="empty-row"><td colspan="7">No se pudo conectar con Django.</td></tr>`;
        mostrarNotificacion(error.message || "No se pudieron cargar los técnicos.", "error");
        actualizarResumen([]);
    }
}

function cargarTecnicoEnFormulario(tecnicoId) {
    const t = tecnicos.find(item => item.id === tecnicoId);
    if (!t) return;
    tecnicoEditandoId = t.id;
    nombreTecnico.value = t.nombre;
    usuarioTecnico.value = t.username;
    usuarioTecnico.disabled = true;
    correoTecnico.value = t.correo || "";
    especialidadTecnico.value = t.especialidad;
    telefonoTecnico.value = t.telefono;
    passwordTecnico.value = "";
    passwordTecnico.placeholder = "Nueva contraseña temporal (opcional)";
    estadoTecnico.value = t.estado;
    btnGuardarTecnico.textContent = "Guardar cambios";
    btnGuardarTecnico.style.background = "rgba(34, 211, 238, 0.15)";
    btnGuardarTecnico.style.color = "#22d3ee";
    btnGuardarTecnico.style.borderColor = "rgba(34, 211, 238, 0.35)";
    document.querySelector(".form-container").scrollIntoView({ behavior: "smooth" });
}

function limpiarFormulario() {
    tecnicoEditandoId = null;
    nombreTecnico.value = "";
    usuarioTecnico.value = "";
    usuarioTecnico.disabled = false;
    correoTecnico.value = "";
    especialidadTecnico.value = "";
    telefonoTecnico.value = "";
    passwordTecnico.value = "";
    passwordTecnico.placeholder = "Contraseña temporal";
    estadoTecnico.value = "Activo";
    btnGuardarTecnico.textContent = "Guardar Técnico";
    btnGuardarTecnico.style.background = "";
    btnGuardarTecnico.style.color = "";
    btnGuardarTecnico.style.borderColor = "";
}

async function guardarTecnico() {
    const nombre = nombreTecnico.value.trim();
    const username = usuarioTecnico.value.trim();
    const correo = correoTecnico.value.trim().toLowerCase();
    const especialidad = especialidadTecnico.value.trim();
    const telefono = telefonoTecnico.value.trim();
    const password = passwordTecnico.value;
    const estado = estadoTecnico.value;

    if (!nombre || !username || !correo || !especialidad || !telefono || (!tecnicoEditandoId && !password)) {
        mostrarNotificacion("Completa todos los campos requeridos.", "error");
        return;
    }
    if (!usuarioValido(username)) return mostrarNotificacion("El usuario debe tener 4 a 30 caracteres validos.", "error");
    if (!correoValido(correo)) return mostrarNotificacion("Ingresa un correo valido.", "error");
    if (!telefonoValido(telefono)) return mostrarNotificacion("Ingresa un teléfono válido con formato 7777-8888.", "error");
    if (password && password.length < 8) return mostrarNotificacion("La contraseña temporal debe tener al menos 8 caracteres.", "error");

    const url = tecnicoEditandoId ? `${API_BASE}/tecnicos/${tecnicoEditandoId}/actualizar/` : `${API_BASE}/tecnicos/crear/`;
    const respuesta = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, username, correo, especialidad, telefono, password, estado })
    });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo guardar el técnico.");
    mostrarNotificacion(tecnicoEditandoId ? "Técnico actualizado correctamente." : "Técnico registrado correctamente.", "success");
    limpiarFormulario();
    await cargarTecnicos();
}

async function eliminarTecnico(tecnicoId) {
    const t = tecnicos.find(item => item.id === tecnicoId);
    if (!t) return;
    const confirmado = await confirmarAccion({ titulo: "Eliminar técnico", mensaje: `Seguro que quieres eliminar a ${t.nombre}? Esta acción borrará su usuario.` });
    if (!confirmado) return;
    const respuesta = await fetch(`${API_BASE}/tecnicos/${tecnicoId}/eliminar/`, { method: "POST", credentials: "include" });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo eliminar el técnico.");
    if (tecnicoEditandoId === tecnicoId) limpiarFormulario();
    mostrarNotificacion("Técnico eliminado correctamente.", "success");
    await cargarTecnicos();
}

btnGuardarTecnico.addEventListener("click", async () => {
    try { await guardarTecnico(); } catch (error) { mostrarNotificacion(error.message || "No se pudo guardar el técnico.", "error"); }
});

buscarTecnico.addEventListener("keyup", () => {
    const filtro = buscarTecnico.value.toLowerCase();
    const filtrados = tecnicos.filter(t =>
        t.nombre.toLowerCase().includes(filtro) ||
        t.username.toLowerCase().includes(filtro) ||
        String(t.correo || "").toLowerCase().includes(filtro) ||
        t.especialidad.toLowerCase().includes(filtro) ||
        t.telefono.toLowerCase().includes(filtro)
    );
    renderizarTabla(filtrados);
    actualizarResumen(filtrados);
});

telefonoTecnico?.addEventListener("input", (event) => formatearTelefono(event.target));
cargarTecnicos();

