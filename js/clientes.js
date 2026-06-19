const btnGuardarCliente = document.getElementById("btnGuardarCliente");
const tablaClientes     = document.querySelector("#tablaClientes tbody");
const buscarCliente     = document.getElementById("buscarCliente");

const totalClientes     = document.getElementById("totalClientes");
const clientesActivos   = document.getElementById("clientesActivos");
const clientesInactivos = document.getElementById("clientesInactivos");
const clientesNuevos    = document.getElementById("clientesNuevos");

const resumenTotal      = document.getElementById("resumenTotal");
const resumenActivos    = document.getElementById("resumenActivos");
const resumenInactivos  = document.getElementById("resumenInactivos");

// Datos iniciales - coinciden con las filas del HTML
const clientes = [
    { nombre: "Juan Pérez",   correo: "juan@email.com",  telefono: "8888-8888", estado: "Activo" },
    { nombre: "María López",  correo: "maria@email.com", telefono: "7777-7777", estado: "Inactivo" }
];

let indiceEditando = -1;

function correoValido(correo) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function telefonoValido(telefono) {
    const soloDigitos = telefono.replace(/\D/g, "");
    return soloDigitos.length >= 8;
}

function actualizarResumenClientes() {
    let activos = 0, inactivos = 0;
    clientes.forEach(c => {
        if (c.estado === "Activo") activos++;
        else inactivos++;
    });

    if (totalClientes)     totalClientes.textContent     = clientes.length;
    if (clientesActivos)   clientesActivos.textContent   = activos;
    if (clientesInactivos) clientesInactivos.textContent = inactivos;
    if (clientesNuevos)    clientesNuevos.textContent    = clientes.length;
    if (resumenTotal)      resumenTotal.textContent      = clientes.length;
    if (resumenActivos)    resumenActivos.textContent    = activos;
    if (resumenInactivos)  resumenInactivos.textContent  = inactivos;
}

function renderizarTabla(lista) {
    tablaClientes.innerHTML = "";

    lista.forEach((cliente) => {
        const indexReal   = clientes.indexOf(cliente);
        const claseEstado = cliente.estado === "Activo" ? "activo" : "inactivo";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${indexReal + 1}</td>
            <td>${cliente.nombre}</td>
            <td>${cliente.correo}</td>
            <td>${cliente.telefono}</td>
            <td><span class="estado-cliente ${claseEstado}">${cliente.estado}</span></td>
            <td>
                <button class="btn-editar"><i class="fa fa-pen"></i> Editar</button>
                <button class="btn-eliminar"><i class="fa fa-trash"></i> Eliminar</button>
            </td>
        `;

        tr.querySelector(".btn-editar").addEventListener("click", () => {
            cargarClienteEnFormulario(indexReal);
        });

        tr.querySelector(".btn-eliminar").addEventListener("click", async () => {
            const confirmado = await confirmarAccion({
                titulo: "Eliminar cliente",
                mensaje: `¿Seguro que querés eliminar a ${cliente.nombre}? Esta acción no se puede deshacer.`
            });

            if (!confirmado) return;

            clientes.splice(indexReal, 1);
            if (indiceEditando === indexReal) {
                limpiarFormulario();
            } else if (indiceEditando > indexReal) {
                indiceEditando--;
            }
            renderizarTabla(clientes);
            actualizarResumenClientes();
            mostrarNotificacion("Cliente eliminado correctamente.", "success");
        });

        tablaClientes.appendChild(tr);
    });
}

function cargarClienteEnFormulario(index) {
    const c = clientes[index];
    indiceEditando = index;

    document.getElementById("nombreCliente").value   = c.nombre;
    document.getElementById("correoCliente").value   = c.correo;
    document.getElementById("telefonoCliente").value = c.telefono;
    document.getElementById("estadoCliente").value   = c.estado;

    btnGuardarCliente.textContent       = "Guardar cambios";
    btnGuardarCliente.style.background  = "rgba(34, 211, 238, 0.15)";
    btnGuardarCliente.style.color       = "#22d3ee";
    btnGuardarCliente.style.borderColor = "rgba(34, 211, 238, 0.35)";

    document.querySelector(".cliente-formulario").scrollIntoView({ behavior: "smooth" });
}

function limpiarFormulario() {
    document.getElementById("nombreCliente").value   = "";
    document.getElementById("correoCliente").value   = "";
    document.getElementById("telefonoCliente").value = "";
    document.getElementById("estadoCliente").value   = "Activo";

    indiceEditando = -1;
    btnGuardarCliente.textContent       = "Guardar Cliente";
    btnGuardarCliente.style.background  = "";
    btnGuardarCliente.style.color       = "";
    btnGuardarCliente.style.borderColor = "";
}

btnGuardarCliente.addEventListener("click", () => {
    const nombre   = document.getElementById("nombreCliente").value.trim();
    const correo   = document.getElementById("correoCliente").value.trim();
    const telefono = document.getElementById("telefonoCliente").value.trim();
    const estado   = document.getElementById("estadoCliente").value;

    if (!nombre || !correo || !telefono) {
        mostrarNotificacion("Completa todos los campos.");
        return;
    }

    if (nombre.length < 3) {
        mostrarNotificacion("El nombre del cliente debe tener al menos 3 caracteres.");
        return;
    }

    if (!correoValido(correo)) {
        mostrarNotificacion("Ingresa un correo válido.");
        return;
    }

    if (!telefonoValido(telefono)) {
        mostrarNotificacion("Ingresa un teléfono válido de al menos 8 dígitos.");
        return;
    }

    if (indiceEditando >= 0) {
        clientes[indiceEditando] = { nombre, correo, telefono, estado };
    } else {
        clientes.push({ nombre, correo, telefono, estado });
    }

    renderizarTabla(clientes);
    actualizarResumenClientes();
    limpiarFormulario();
    mostrarNotificacion("Cliente guardado correctamente.", "success");
});

buscarCliente.addEventListener("keyup", () => {
    const filtro = buscarCliente.value.toLowerCase();
    const filtrados = clientes.filter(c =>
        c.nombre.toLowerCase().includes(filtro) ||
        c.correo.toLowerCase().includes(filtro) ||
        c.telefono.toLowerCase().includes(filtro)
    );
    renderizarTabla(filtrados);
});

// Arrancar
renderizarTabla(clientes);
actualizarResumenClientes();


