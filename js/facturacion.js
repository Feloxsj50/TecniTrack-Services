const API_BASE = window.location.origin;
const detallesFactura = [];
let tecnicosDisponibles = [];
const facturas = [
    {
        numero: "F-001",
        fecha: "2026-02-22",
        cliente: "Juan Perez",
        tecnico: "Luis Canda",
        total: 45,
        metodoPago: "Efectivo",
        estado: "Pagado"
    },
    {
        numero: "F-002",
        fecha: "2026-02-22",
        cliente: "Maria López",
        tecnico: "Luis Canda",
        total: 35,
        metodoPago: "Transferencia",
        estado: "Pagado"
    },
    {
        numero: "F-003",
        fecha: "2026-02-21",
        cliente: "Ana Gómez",
        tecnico: "Natalia Ruiz",
        total: 70,
        metodoPago: "-----",
        estado: "Pendiente"
    }
];

const tbodyDetalle  = document.querySelector("#tablaDetalleFactura tbody");
const tbodyFacturas = document.querySelector("#tablaFacturas tbody");

// Índice de la factura que se está editando (-1 = modo nueva)
let indiceEditando = -1;

function esMontoValido(valor) {
    return Number.isFinite(valor) && valor >= 0;
}

function esCantidadValida(valor) {
    return Number.isInteger(valor) && valor > 0;
}

function limpiarValorCsv(valor) {
    return `"${String(valor).replaceAll('"', '""')}"`;
}

async function leerRespuestaJson(respuesta) {
    const texto = await respuesta.text();
    try {
        return JSON.parse(texto);
    } catch {
        return { ok: false, error: "Django devolvio una respuesta no valida." };
    }
}

function pintarSelectTecnicos(valorSeleccionado = "") {
    const select = document.getElementById("tecnicoFactura");
    if (!select) return;

    select.innerHTML = `<option value="">Seleccionar tecnico</option>`;

    tecnicosDisponibles.forEach(tecnico => {
        const option = document.createElement("option");
        option.value = tecnico.username;
        option.textContent = tecnico.nombre;
        select.appendChild(option);
    });

    if (valorSeleccionado && !tecnicosDisponibles.some(tecnico => tecnico.username === valorSeleccionado)) {
        const option = document.createElement("option");
        option.value = valorSeleccionado;
        option.textContent = valorSeleccionado;
        select.appendChild(option);
    }

    select.value = valorSeleccionado;
}

function nombreTecnico(valor) {
    const tecnico = tecnicosDisponibles.find(item => item.username === valor);
    return tecnico ? tecnico.nombre : valor;
}

async function cargarTecnicosFactura() {
    const select = document.getElementById("tecnicoFactura");
    if (select) select.innerHTML = `<option value="">Cargando tecnicos...</option>`;

    try {
        const respuesta = await fetch(`${API_BASE}/tecnicos/`, { credentials: "include" });
        const datos = await leerRespuestaJson(respuesta);

        if (!respuesta.ok || !datos.ok) {
            throw new Error(datos.error || "No se pudieron cargar los tecnicos.");
        }

        tecnicosDisponibles = datos.tecnicos.filter(tecnico => tecnico.estado === "Activo");
        pintarSelectTecnicos();
    } catch (error) {
        tecnicosDisponibles = [];
        if (select) select.innerHTML = `<option value="">Sin tecnicos disponibles</option>`;
        mostrarNotificacion(error.message || "No se pudieron cargar los tecnicos.", "error");
    }
}

function descargarCsv(nombreArchivo, encabezados, filas) {
    const contenido = [
        encabezados.map(limpiarValorCsv).join(","),
        ...filas.map(fila => fila.map(limpiarValorCsv).join(","))
    ].join("\n");

    const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
}

function generarNumeroFactura() {
    const mayorNumero = facturas.reduce((mayor, factura) => {
        const numero = parseInt(factura.numero.replace("F-", ""), 10);
        return Number.isNaN(numero) ? mayor : Math.max(mayor, numero);
    }, 0);

    document.getElementById("numeroFactura").value = `F-${String(mayorNumero + 1).padStart(3, "0")}`;
}

function renderDetalleFactura() {
    tbodyDetalle.innerHTML = "";

    detallesFactura.forEach(item => {
        const subtotal = item.cantidad * item.precio;
        tbodyDetalle.innerHTML += `
            <tr>
                <td>${item.producto}</td>
                <td>${item.cantidad}</td>
                <td>$${item.precio.toFixed(2)}</td>
                <td>$${subtotal.toFixed(2)}</td>
            </tr>
        `;
    });

    actualizarResumen();
}

function actualizarResumen() {
    const servicio = parseFloat(document.getElementById("precioServicio").value) || 0;

    let repuestos = 0;
    detallesFactura.forEach(item => repuestos += item.cantidad * item.precio);

    const total = servicio + repuestos;

    document.getElementById("resumenServicio").textContent  = `$${servicio.toFixed(2)}`;
    document.getElementById("resumenRepuestos").textContent = `$${repuestos.toFixed(2)}`;
    document.getElementById("resumenSubtotal").textContent  = `$${total.toFixed(2)}`;
    document.getElementById("resumenTotal").textContent     = `$${total.toFixed(2)}`;
}

function claseEstadoFactura(estado) {
    return estado === "Pagado" ? "estado-factura pagado" : "estado-factura pendiente";
}

function renderHistorialFacturas(lista) {
    tbodyFacturas.innerHTML = "";

    lista.forEach((factura, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${factura.numero}</td>
            <td>${factura.fecha}</td>
            <td>${factura.cliente}</td>
            <td>${nombreTecnico(factura.tecnico)}</td>
            <td>$${factura.total.toFixed(2)}</td>
            <td>${factura.metodoPago}</td>
            <td><span class="${claseEstadoFactura(factura.estado)}">${factura.estado}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn-editar-historial" data-index="${facturas.indexOf(factura)}">
                        <i class="fa fa-pen"></i> Editar
                    </button>
                    <button class="btn-eliminar-tabla" data-index="${facturas.indexOf(factura)}">
                        <i class="fa fa-trash"></i> Eliminar
                    </button>
                </div>
            </td>
        `;
        tbodyFacturas.appendChild(tr);
    });

    // Eventos editar
    tbodyFacturas.querySelectorAll(".btn-editar-historial").forEach(btn => {
        btn.addEventListener("click", () => {
            const i = parseInt(btn.getAttribute("data-index"));
            cargarFacturaEnFormulario(i);
        });
    });

    tbodyFacturas.querySelectorAll(".btn-eliminar-tabla").forEach(btn => {
        btn.addEventListener("click", async () => {
            const index = parseInt(btn.getAttribute("data-index"), 10);
            const factura = facturas[index];
            const confirmado = await confirmarAccion({
                titulo: "Eliminar factura",
                mensaje: `¿Seguro que querés eliminar la factura ${factura.numero} de ${factura.cliente}?`
            });

            if (!confirmado) return;

            facturas.splice(index, 1);
            if (indiceEditando === index) {
                limpiarFactura();
            } else if (indiceEditando > index) {
                indiceEditando--;
            }

            renderHistorialFacturas(facturas);
            generarNumeroFactura();
            mostrarNotificacion("Factura eliminada correctamente.", "success");
        });
    });
}

function cargarFacturaEnFormulario(index) {
    const f = facturas[index];
    indiceEditando = index;

    document.getElementById("numeroFactura").value    = f.numero;
    document.getElementById("fechaFactura").value     = f.fecha;
    document.getElementById("clienteFactura").value   = f.cliente;
    pintarSelectTecnicos(f.tecnico);
    document.getElementById("precioServicio").value   = f.total;
    document.getElementById("metodoPagoFactura").value = f.metodoPago;
    document.getElementById("estadoFactura").value    = f.estado;
    actualizarResumen();

    // Cambiar botón a modo edición
    const btnGuardar = document.getElementById("btnGuardarFactura");
    btnGuardar.textContent = "Guardar cambios";
    btnGuardar.style.background    = "rgba(34, 211, 238, 0.15)";
    btnGuardar.style.color         = "#22d3ee";
    btnGuardar.style.borderColor   = "rgba(34, 211, 238, 0.35)";

    // Scroll suave al formulario
    document.querySelector(".factura-formulario").scrollIntoView({ behavior: "smooth" });
}

function limpiarFactura() {
    document.getElementById("fechaFactura").value      = "";
    document.getElementById("clienteFactura").value    = "";
    pintarSelectTecnicos();
    document.getElementById("servicioFactura").value   = "";
    document.getElementById("precioServicio").value    = "";
    document.getElementById("productoFactura").value   = "";
    document.getElementById("cantidadProducto").value  = "";
    document.getElementById("precioProducto").value    = "";
    document.getElementById("metodoPagoFactura").value = "Efectivo";
    document.getElementById("estadoFactura").value     = "Pagado";
    document.getElementById("garantiaFactura").value   = "30 Días";

    detallesFactura.length = 0;
    renderDetalleFactura();

    // Restaurar botón a modo nueva factura
    indiceEditando = -1;
    const btnGuardar = document.getElementById("btnGuardarFactura");
    btnGuardar.textContent   = "Guardar Factura";
    btnGuardar.style.background  = "";
    btnGuardar.style.color       = "";
    btnGuardar.style.borderColor = "";

    generarNumeroFactura();
}

document.getElementById("btnAgregarProductoFactura").addEventListener("click", () => {
    const producto  = document.getElementById("productoFactura").value.trim();
    const cantidad  = parseInt(document.getElementById("cantidadProducto").value);
    const precio    = parseFloat(document.getElementById("precioProducto").value);

    if (!producto || isNaN(cantidad) || isNaN(precio)) {
        mostrarNotificacion("Completa producto, cantidad y precio.");
        return;
    }

    if (producto.length < 3) {
        mostrarNotificacion("El producto debe tener al menos 3 caracteres.");
        return;
    }

    if (!esCantidadValida(cantidad)) {
        mostrarNotificacion("La cantidad debe ser un número entero mayor que 0.");
        return;
    }

    if (!esMontoValido(precio)) {
        mostrarNotificacion("El precio del producto debe ser de 0 en adelante.");
        return;
    }

    detallesFactura.push({ producto, cantidad, precio });

    document.getElementById("productoFactura").value  = "";
    document.getElementById("cantidadProducto").value = "";
    document.getElementById("precioProducto").value   = "";

    renderDetalleFactura();
});

document.getElementById("precioServicio").addEventListener("input", actualizarResumen);

document.getElementById("btnGuardarFactura").addEventListener("click", () => {
    const numero     = document.getElementById("numeroFactura").value;
    const fecha      = document.getElementById("fechaFactura").value;
    const cliente    = document.getElementById("clienteFactura").value.trim();
    const tecnico    = document.getElementById("tecnicoFactura").value;
    const servicio   = document.getElementById("servicioFactura").value;
    const precioServicio = parseFloat(document.getElementById("precioServicio").value) || 0;
    const metodoPago = document.getElementById("metodoPagoFactura").value;
    const estado     = document.getElementById("estadoFactura").value;
    const total      = parseFloat(document.getElementById("resumenTotal").textContent.replace("$", "")) || 0;

    if (!fecha || !cliente || !tecnico) {
        mostrarNotificacion("Completa los campos principales de la factura.");
        return;
    }

    if (cliente.length < 3) {
        mostrarNotificacion("El nombre del cliente debe tener al menos 3 caracteres.");
        return;
    }

    if (indiceEditando < 0 && !servicio && detallesFactura.length === 0) {
        mostrarNotificacion("Selecciona un servicio o agrega al menos un producto.");
        return;
    }

    if (!esMontoValido(precioServicio)) {
        mostrarNotificacion("El precio del servicio debe ser de 0 en adelante.");
        return;
    }

    if (total <= 0) {
        mostrarNotificacion("La factura debe tener un total mayor que 0.");
        return;
    }

    if (indiceEditando >= 0) {
        // Modo edición - actualizar factura existente
        facturas[indiceEditando] = {
            ...facturas[indiceEditando],
            fecha, cliente, tecnico, total, metodoPago, estado
        };
    } else {
        // Modo nueva factura
        facturas.push({ numero, fecha, cliente, tecnico, total, metodoPago, estado });
    }

    renderHistorialFacturas(facturas);
    limpiarFactura();
    mostrarNotificacion("Factura guardada correctamente.", "success");
});

document.getElementById("btnCancelarFactura").addEventListener("click", limpiarFactura);

document.getElementById("btnImprimirFactura").addEventListener("click", () => {
    const numero = document.getElementById("numeroFactura").value;
    const fecha = document.getElementById("fechaFactura").value || "Sin fecha";
    const cliente = document.getElementById("clienteFactura").value.trim() || "Sin cliente";
    const tecnico = nombreTecnico(document.getElementById("tecnicoFactura").value) || "Sin tecnico";
    const servicio = document.getElementById("servicioFactura").value || "Servicio no seleccionado";
    const metodoPago = document.getElementById("metodoPagoFactura").value;
    const estado = document.getElementById("estadoFactura").value;
    const garantia = document.getElementById("garantiaFactura").value;
    const precioServicio = parseFloat(document.getElementById("precioServicio").value) || 0;

    const repuestosHtml = detallesFactura.length
        ? detallesFactura.map(item => `
            <tr>
                <td>${item.producto}</td>
                <td>${item.cantidad}</td>
                <td>$${item.precio.toFixed(2)}</td>
                <td>$${(item.cantidad * item.precio).toFixed(2)}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="4">Sin repuestos agregados</td></tr>`;

    const ventana = window.open("", "_blank");
    ventana.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>${numero}</title>
            <style>
                body { font-family: Arial, sans-serif; color: #111827; padding: 32px; }
                h1 { margin-bottom: 4px; }
                .muted { color: #6b7280; margin-top: 0; }
                .info { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; margin: 24px 0; }
                table { width: 100%; border-collapse: collapse; margin-top: 18px; }
                th, td { border-bottom: 1px solid #e5e7eb; padding: 10px; text-align: left; }
                th { background: #f3f4f6; }
                .total { text-align: right; font-size: 20px; font-weight: 700; margin-top: 22px; }
            </style>
        </head>
        <body>
            <h1>TecniTrack Services</h1>
            <p class="muted">Factura ${numero}</p>

            <div class="info">
                <div><strong>Fecha:</strong> ${fecha}</div>
                <div><strong>Cliente:</strong> ${cliente}</div>
                <div><strong>Técnico:</strong> ${tecnico}</div>
                <div><strong>Servicio:</strong> ${servicio}</div>
                <div><strong>Método de pago:</strong> ${metodoPago}</div>
                <div><strong>Estado:</strong> ${estado}</div>
                <div><strong>Garantía:</strong> ${garantia}</div>
                <div><strong>Servicio:</strong> $${precioServicio.toFixed(2)}</div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Precio</th>
                        <th>Subtotal</th>
                    </tr>
                </thead>
                <tbody>${repuestosHtml}</tbody>
            </table>

            <p class="total">Total: ${document.getElementById("resumenTotal").textContent}</p>

            <script>
                window.print();
            <\/script>
        </body>
        </html>
    `);
    ventana.document.close();
});

document.getElementById("btnHistorialFacturas").addEventListener("click", () => {
    const resumen = facturas
        .map(factura => `${factura.numero} - ${factura.cliente}: $${factura.total.toFixed(2)} (${factura.estado})`)
        .join("\n");

    mostrarNotificacion(`Historial actual de facturación:\n\n${resumen}`, "info");
});

document.getElementById("btnExportarFacturas").addEventListener("click", () => {
    const filas = facturas.map(factura => [
        factura.numero,
        factura.fecha,
        factura.cliente,
        factura.tecnico,
        factura.total.toFixed(2),
        factura.metodoPago,
        factura.estado
    ]);

    descargarCsv(
        "reporte_facturas.csv",
        ["Factura", "Fecha", "Cliente", "Técnico", "Total", "Método de pago", "Estado"],
        filas
    );
    mostrarNotificacion("Reporte de facturación exportado correctamente.", "success");
});

document.getElementById("buscarFactura").addEventListener("input", (e) => {
    const texto = e.target.value.toLowerCase();
    const filtradas = facturas.filter(f =>
        f.numero.toLowerCase().includes(texto) ||
        f.cliente.toLowerCase().includes(texto) ||
        nombreTecnico(f.tecnico).toLowerCase().includes(texto)
    );
    renderHistorialFacturas(filtradas);
});

async function iniciarFacturacion() {
    await cargarTecnicosFactura();
    generarNumeroFactura();
    renderDetalleFactura();
    renderHistorialFacturas(facturas);
}

iniciarFacturacion();

