const btnGuardarCliente = document.getElementById("btnGuardarCliente");
const tablaClientes = document.querySelector("#tablaClientes tbody");
const buscarCliente = document.getElementById("buscarCliente");
const nombreCliente = document.getElementById("nombreCliente");
const usuarioCliente = document.getElementById("usuarioCliente");
const correoCliente = document.getElementById("correoCliente");
const telefonoCliente = document.getElementById("telefonoCliente");
const passwordCliente = document.getElementById("passwordCliente");
const estadoCliente = document.getElementById("estadoCliente");

const totalClientes = document.getElementById("totalClientes");
const clientesActivos = document.getElementById("clientesActivos");
const clientesInactivos = document.getElementById("clientesInactivos");
const clientesNuevos = document.getElementById("clientesNuevos");

const resumenTotal = document.getElementById("resumenTotal");
const resumenActivos = document.getElementById("resumenActivos");
const resumenInactivos = document.getElementById("resumenInactivos");

const API_BASE = window.location.origin;
let clientes = [];
let clienteEditandoId = null;
let csrfToken = "";

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatearTelefono(input) {
    const digitos = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = digitos.length > 4 ? `${digitos.slice(0, 4)}-${digitos.slice(4)}` : digitos;
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

async function leerRespuestaJson(respuesta) {
    const texto = await respuesta.text();

    try {
        return JSON.parse(texto);
    } catch {
        return {
            ok: false,
            error: respuesta.status === 403
                ? "No se pudo validar la seguridad de Django. Inicia sesion como admin nuevamente."
                : "Django devolvio una respuesta no valida. Abre el sitio desde el servidor de Django."
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
        throw new Error("No se pudo preparar la seguridad de la solicitud.");
    }

    csrfToken = datos.csrfToken;
    return csrfToken;
}

function actualizarResumenClientes(lista = clientes) {
    const activos = lista.filter(c => c.estado === "Activo").length;
    const inactivos = lista.filter(c => c.estado !== "Activo").length;
    const hoy = new Date().toISOString().slice(0, 10);
    const nuevos = lista.filter(c => c.creado_en?.slice(0, 10) === hoy).length;

    if (totalClientes) totalClientes.textContent = lista.length;
    if (clientesActivos) clientesActivos.textContent = activos;
    if (clientesInactivos) clientesInactivos.textContent = inactivos;
    if (clientesNuevos) clientesNuevos.textContent = nuevos;
    if (resumenTotal) resumenTotal.textContent = lista.length;
    if (resumenActivos) resumenActivos.textContent = activos;
    if (resumenInactivos) resumenInactivos.textContent = inactivos;
}

function renderizarTabla(lista) {
    tablaClientes.innerHTML = "";

    if (!lista.length) {
        tablaClientes.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fa-solid fa-users"></i>
                        <strong>Sin clientes registrados</strong>
                        <span>Cuando un cliente se registre, aparecera aqui.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    lista.forEach((cliente) => {
        const claseEstado = cliente.estado === "Activo" ? "activo" : "inactivo";
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${escaparHtml(cliente.id)}</td>
            <td>${escaparHtml(cliente.nombre)}<br><small>@${escaparHtml(cliente.usuario)}</small></td>
            <td>${escaparHtml(cliente.correo)}</td>
            <td>${escaparHtml(cliente.telefono || "Sin telefono")}</td>
            <td><span class="estado-cliente ${claseEstado}">${escaparHtml(cliente.estado)}</span></td>
            <td>
                <button class="btn-editar" type="button" data-editar="${cliente.id}"><i class="fa fa-pen"></i> Editar</button>
                <button class="btn-eliminar" type="button" data-eliminar="${cliente.id}"><i class="fa fa-trash"></i> Eliminar</button>
            </td>
        `;

        tablaClientes.appendChild(tr);
    });

    tablaClientes.querySelectorAll("[data-editar]").forEach(boton => {
        boton.addEventListener("click", () => cargarClienteEnFormulario(Number(boton.dataset.editar)));
    });

    tablaClientes.querySelectorAll("[data-eliminar]").forEach(boton => {
        boton.addEventListener("click", () => eliminarCliente(Number(boton.dataset.eliminar)));
    });
}

async function cargarClientes() {
    tablaClientes.innerHTML = `
        <tr class="empty-row">
            <td colspan="6">Cargando clientes...</td>
        </tr>
    `;

    try {
        const respuesta = await fetch(`${API_BASE}/clientes/`, {
            credentials: "include"
        });
        const datos = await leerRespuestaJson(respuesta);

        if (!respuesta.ok || !datos.ok) {
            throw new Error(datos.error || "No se pudieron cargar los clientes.");
        }

        clientes = datos.clientes;
        renderizarTabla(clientes);
        actualizarResumenClientes(clientes);
    } catch (error) {
        tablaClientes.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <strong>No se pudo conectar con Django</strong>
                        <span>Verifica que el servidor de Django este activo.</span>
                    </div>
                </td>
            </tr>
        `;
        mostrarNotificacion(error.message || "No se pudieron cargar los clientes.", "error");
        actualizarResumenClientes([]);
    }
}

function cargarClienteEnFormulario(clienteId) {
    const cliente = clientes.find(item => item.id === clienteId);
    if (!cliente) return;

    clienteEditandoId = cliente.id;
    nombreCliente.value = cliente.nombre;
    usuarioCliente.value = cliente.usuario;
    usuarioCliente.disabled = true;
    correoCliente.value = cliente.correo;
    telefonoCliente.value = cliente.telefono || "";
    passwordCliente.value = "";
    passwordCliente.placeholder = "Nueva contrasena temporal (opcional)";
    estadoCliente.value = cliente.estado;

    btnGuardarCliente.textContent = "Guardar cambios";
    btnGuardarCliente.style.background = "rgba(34, 211, 238, 0.15)";
    btnGuardarCliente.style.color = "#22d3ee";
    btnGuardarCliente.style.borderColor = "rgba(34, 211, 238, 0.35)";

    document.querySelector(".cliente-formulario")?.scrollIntoView({ behavior: "smooth" });
}

function limpiarFormulario() {
    clienteEditandoId = null;
    nombreCliente.value = "";
    usuarioCliente.value = "";
    usuarioCliente.disabled = false;
    correoCliente.value = "";
    telefonoCliente.value = "";
    passwordCliente.value = "";
    passwordCliente.placeholder = "Contrasena temporal";
    estadoCliente.value = "Activo";

    btnGuardarCliente.textContent = "Guardar Cliente";
    btnGuardarCliente.style.background = "";
    btnGuardarCliente.style.color = "";
    btnGuardarCliente.style.borderColor = "";
}

function validarFormularioCliente({ nombre, username, correo, telefono, password }) {
    if (!nombre || !correo || !telefono) {
        mostrarNotificacion("Completa nombre, correo y telefono.", "error");
        return false;
    }

    if (!clienteEditandoId && !username) {
        mostrarNotificacion("Ingresa un usuario para el cliente.", "error");
        return false;
    }

    if (username && !usuarioValido(username)) {
        mostrarNotificacion("El usuario debe tener de 4 a 30 caracteres validos.", "error");
        return false;
    }

    if (!correoValido(correo)) {
        mostrarNotificacion("Ingresa un correo valido.", "error");
        return false;
    }

    if (!telefonoValido(telefono)) {
        mostrarNotificacion("Ingresa un telefono valido con formato 7777-8888.", "error");
        return false;
    }

    if (!clienteEditandoId && !password) {
        mostrarNotificacion("Ingresa una contrasena temporal para el cliente.", "error");
        return false;
    }

    if (password && password.length < 8) {
        mostrarNotificacion("La contrasena temporal debe tener al menos 8 caracteres.", "error");
        return false;
    }

    return true;
}

async function guardarCliente() {
    const nombre = nombreCliente.value.trim();
    const username = usuarioCliente.value.trim();
    const correo = correoCliente.value.trim().toLowerCase();
    const telefono = telefonoCliente.value.trim();
    const password = passwordCliente.value;
    const estado = estadoCliente.value;

    const payload = { nombre, username, correo, telefono, password, estado };
    if (!validarFormularioCliente(payload)) return;

    const token = await obtenerCsrfToken();
    const url = clienteEditandoId
        ? `${API_BASE}/clientes/${clienteEditandoId}/actualizar/`
        : `${API_BASE}/clientes/crear/`;

    const respuesta = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": token
        },
        body: JSON.stringify(payload)
    });
    const datos = await leerRespuestaJson(respuesta);

    if (!respuesta.ok || !datos.ok) {
        throw new Error(datos.error || "No se pudo guardar el cliente.");
    }

    mostrarNotificacion(
        clienteEditandoId ? "Cliente actualizado correctamente." : "Cliente registrado correctamente.",
        "success"
    );
    limpiarFormulario();
    await cargarClientes();
}

async function eliminarCliente(clienteId) {
    const cliente = clientes.find(item => item.id === clienteId);
    if (!cliente) return;

    const confirmado = await confirmarAccion({
        titulo: "Eliminar cliente",
        mensaje: `Seguro que queres eliminar a ${cliente.nombre}? Esta accion no se puede deshacer.`
    });

    if (!confirmado) return;

    const token = await obtenerCsrfToken();
    const respuesta = await fetch(`${API_BASE}/clientes/${clienteId}/eliminar/`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": token }
    });
    const datos = await leerRespuestaJson(respuesta);

    if (!respuesta.ok || !datos.ok) {
        throw new Error(datos.error || "No se pudo eliminar el cliente.");
    }

    if (clienteEditandoId === clienteId) limpiarFormulario();
    mostrarNotificacion("Cliente eliminado correctamente.", "success");
    await cargarClientes();
}

btnGuardarCliente?.addEventListener("click", async () => {
    try {
        await guardarCliente();
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo guardar el cliente.", "error");
    }
});

buscarCliente?.addEventListener("keyup", () => {
    const filtro = buscarCliente.value.toLowerCase();
    const filtrados = clientes.filter(c =>
        c.nombre.toLowerCase().includes(filtro) ||
        c.usuario.toLowerCase().includes(filtro) ||
        c.correo.toLowerCase().includes(filtro) ||
        String(c.telefono || "").toLowerCase().includes(filtro)
    );

    renderizarTabla(filtrados);
    actualizarResumenClientes(filtrados);
});

telefonoCliente?.addEventListener("input", (event) => {
    formatearTelefono(event.target);
});

cargarClientes();

