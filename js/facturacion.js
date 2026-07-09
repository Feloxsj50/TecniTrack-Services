const API_BASE = window.location.origin;
const detallesFactura = [];
let facturas = [];
let serviciosCompletados = [];
let facturaEditando = null;
let servicioSeleccionado = null;

const tbodyDetalle = document.querySelector("#tablaDetalleFactura tbody");
const tbodyFacturas = document.querySelector("#tablaFacturas tbody");

function obtenerCookie(nombre) {
    const valor = `; ${document.cookie}`;
    const partes = valor.split(`; ${nombre}=`);
    if (partes.length === 2) return partes.pop().split(";").shift();
    return "";
}

async function leerRespuestaJson(respuesta) {
    const texto = await respuesta.text();
    try {
        return JSON.parse(texto);
    } catch {
        return { ok: false, error: "Django devolvio una respuesta no valida." };
    }
}

async function apiJson(url, opciones = {}) {
    const respuesta = await fetch(`${API_BASE}${url}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": obtenerCookie("csrftoken"),
            ...(opciones.headers || {})
        },
        ...opciones
    });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) {
        throw new Error(datos.error || "No se pudo completar la accion.");
    }
    return datos;
}

function moneda(valor) {
    return `$${Number(valor || 0).toFixed(2)}`;
}

function hoyIso() {
    return new Date().toISOString().slice(0, 10);
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function esMontoValido(valor) {
    return Number.isFinite(valor) && valor >= 0;
}

function esCantidadValida(valor) {
    return Number.isInteger(valor) && valor > 0;
}

function limpiarValorCsv(valor) {
    return `"${String(valor).replaceAll('"', '""')}"`;
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
        const numero = parseInt(String(factura.numero).replace("F-", ""), 10);
        return Number.isNaN(numero) ? mayor : Math.max(mayor, numero);
    }, 0);

    document.getElementById("numeroFactura").value = facturaEditando?.numero || `F-${String(mayorNumero + 1).padStart(3, "0")}`;
}

function pintarServiciosCompletados() {
    const select = document.getElementById("solicitudFactura");
    const disponibles = serviciosCompletados.filter(servicio => !servicio.facturada || servicio.id === servicioSeleccionado?.id);

    select.innerHTML = `<option value="">Seleccionar orden completada</option>`;

    if (!disponibles.length) {
        select.innerHTML = `<option value="">No hay ordenes completadas por facturar</option>`;
        return;
    }

    disponibles.forEach(servicio => {
        const option = document.createElement("option");
        option.value = servicio.id;
        option.textContent = `${servicio.codigo} - ${servicio.cliente} - ${servicio.servicio}`;
        select.appendChild(option);
    });

    if (servicioSeleccionado) {
        select.value = String(servicioSeleccionado.id);
    }
}

function solicitudDesdeUrl() {
    return new URLSearchParams(window.location.search).get("solicitud");
}

function preseleccionarSolicitudUrl() {
    const solicitudId = solicitudDesdeUrl();
    if (!solicitudId) return;

    const existe = serviciosCompletados.some(servicio => String(servicio.id) === String(solicitudId));
    if (!existe) {
        mostrarNotificacion("La orden seleccionada no esta completada o ya no esta disponible para facturar.", "error");
        return;
    }

    document.getElementById("solicitudFactura").value = solicitudId;
    seleccionarServicio(solicitudId);
    document.querySelector(".factura-formulario")?.scrollIntoView({ behavior: "smooth" });
}
function pintarTecnico(nombre) {
    const select = document.getElementById("tecnicoFactura");
    select.innerHTML = `<option value="${escaparHtml(nombre || "")}">${escaparHtml(nombre || "Tecnico asignado")}</option>`;
}

function seleccionarServicio(id) {
    servicioSeleccionado = serviciosCompletados.find(servicio => String(servicio.id) === String(id)) || null;

    if (!servicioSeleccionado) {
        document.getElementById("clienteFactura").value = "";
        pintarTecnico("");
        document.getElementById("servicioFactura").value = "";
        return;
    }

    document.getElementById("clienteFactura").value = servicioSeleccionado.cliente;
    pintarTecnico(servicioSeleccionado.tecnico);
    document.getElementById("servicioFactura").value = servicioSeleccionado.servicio;
    document.getElementById("fechaFactura").value = hoyIso();
}

function renderDetalleFactura() {
    tbodyDetalle.innerHTML = "";

    detallesFactura.forEach(item => {
        const subtotal = item.cantidad * item.precio;
        tbodyDetalle.innerHTML += `
            <tr>
                <td>${escaparHtml(item.producto)}</td>
                <td>${item.cantidad}</td>
                <td>${moneda(item.precio)}</td>
                <td>${moneda(subtotal)}</td>
            </tr>
        `;
    });

    actualizarResumen();
}

function actualizarResumen() {
    const servicio = parseFloat(document.getElementById("precioServicio").value) || 0;
    const repuestos = detallesFactura.reduce((total, item) => total + item.cantidad * item.precio, 0);
    const total = servicio + repuestos;

    document.getElementById("resumenServicio").textContent = moneda(servicio);
    document.getElementById("resumenRepuestos").textContent = moneda(repuestos);
    document.getElementById("resumenSubtotal").textContent = moneda(total);
    document.getElementById("resumenTotal").textContent = moneda(total);
}

function claseEstadoFactura(estado) {
    return estado === "Pagado" ? "estado-factura pagado" : "estado-factura pendiente";
}

function renderHistorialFacturas(lista) {
    tbodyFacturas.innerHTML = "";

    if (!lista.length) {
        tbodyFacturas.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fa-solid fa-file-invoice-dollar"></i>
                        <strong>Sin facturas registradas</strong>
                        <span>Cuando generes una factura desde una orden completada, aparecera aqui.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    lista.forEach(factura => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${escaparHtml(factura.numero)}</td>
            <td>${escaparHtml(factura.fecha)}</td>
            <td>${escaparHtml(factura.cliente)}</td>
            <td>${escaparHtml(factura.tecnico)}</td>
            <td>${moneda(factura.total)}</td>
            <td>${escaparHtml(factura.metodoPago)}</td>
            <td><span class="${claseEstadoFactura(factura.estado)}">${escaparHtml(factura.estado)}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn-editar-historial" data-id="${factura.id}">
                        <i class="fa fa-pen"></i> Editar
                    </button>
                    <button class="btn-imprimir-fila" data-id="${factura.id}">
                        <i class="fa fa-print"></i> Imprimir
                    </button>
                </div>
            </td>
        `;
        tbodyFacturas.appendChild(tr);
    });

    tbodyFacturas.querySelectorAll(".btn-editar-historial").forEach(btn => {
        btn.addEventListener("click", () => cargarFacturaEnFormulario(btn.dataset.id));
    });

    tbodyFacturas.querySelectorAll(".btn-imprimir-fila").forEach(btn => {
        btn.addEventListener("click", () => {
            const factura = facturas.find(item => String(item.id) === String(btn.dataset.id));
            imprimirFactura(factura);
        });
    });
}

function cargarFacturaEnFormulario(id) {
    const factura = facturas.find(item => String(item.id) === String(id));
    if (!factura) return;

    facturaEditando = factura;
    servicioSeleccionado = serviciosCompletados.find(servicio => servicio.id === factura.solicitudId) || {
        id: factura.solicitudId,
        codigo: factura.solicitudCodigo,
        cliente: factura.cliente,
        tecnico: factura.tecnico,
        servicio: factura.servicio,
        dispositivo: factura.dispositivo,
        facturada: true
    };

    if (!serviciosCompletados.some(servicio => servicio.id === servicioSeleccionado.id)) {
        serviciosCompletados.push(servicioSeleccionado);
    }

    pintarServiciosCompletados();
    seleccionarServicio(servicioSeleccionado.id);

    document.getElementById("numeroFactura").value = factura.numero;
    document.getElementById("fechaFactura").value = factura.fecha;
    document.getElementById("precioServicio").value = factura.montoServicio;
    document.getElementById("metodoPagoFactura").value = factura.metodoPago;
    document.getElementById("estadoFactura").value = factura.estado;
    document.getElementById("garantiaFactura").value = factura.garantia;

    detallesFactura.length = 0;
    factura.productos.forEach(item => {
        detallesFactura.push({
            producto: item.producto || item.nombre,
            cantidad: Number(item.cantidad),
            precio: Number(item.precio)
        });
    });
    renderDetalleFactura();

    const btnGuardar = document.getElementById("btnGuardarFactura");
    btnGuardar.textContent = "Guardar cambios";
    btnGuardar.style.background = "rgba(34, 211, 238, 0.15)";
    btnGuardar.style.color = "#22d3ee";
    btnGuardar.style.borderColor = "rgba(34, 211, 238, 0.35)";

    document.querySelector(".factura-formulario").scrollIntoView({ behavior: "smooth" });
}

function limpiarFactura() {
    facturaEditando = null;
    servicioSeleccionado = null;
    document.getElementById("solicitudFactura").value = "";
    document.getElementById("fechaFactura").value = hoyIso();
    document.getElementById("clienteFactura").value = "";
    pintarTecnico("");
    document.getElementById("servicioFactura").value = "";
    document.getElementById("precioServicio").value = "";
    document.getElementById("productoFactura").value = "";
    document.getElementById("cantidadProducto").value = "";
    document.getElementById("precioProducto").value = "";
    document.getElementById("metodoPagoFactura").value = "Efectivo";
    document.getElementById("estadoFactura").value = "Pagado";
    document.getElementById("garantiaFactura").value = "30 Dias";

    detallesFactura.length = 0;
    renderDetalleFactura();
    pintarServiciosCompletados();
    generarNumeroFactura();

    const btnGuardar = document.getElementById("btnGuardarFactura");
    btnGuardar.textContent = "Guardar Factura";
    btnGuardar.style.background = "";
    btnGuardar.style.color = "";
    btnGuardar.style.borderColor = "";
}

function datosFacturaActual() {
    const precioServicio = parseFloat(document.getElementById("precioServicio").value) || 0;
    return {
        solicitudId: servicioSeleccionado?.id,
        montoServicio: precioServicio,
        productos: detallesFactura,
        metodoPago: document.getElementById("metodoPagoFactura").value,
        estado: document.getElementById("estadoFactura").value,
        garantia: document.getElementById("garantiaFactura").value
    };
}

async function guardarFactura() {
    if (!servicioSeleccionado) {
        mostrarNotificacion("Selecciona una orden completada.");
        return;
    }

    const precioServicio = parseFloat(document.getElementById("precioServicio").value) || 0;
    const total = precioServicio + detallesFactura.reduce((suma, item) => suma + item.cantidad * item.precio, 0);

    if (!esMontoValido(precioServicio)) {
        mostrarNotificacion("El precio del servicio debe ser de 0 en adelante.");
        return;
    }

    if (total <= 0) {
        mostrarNotificacion("La factura debe tener un total mayor que 0.");
        return;
    }

    try {
        await apiJson("/facturacion/crear/", {
            method: "POST",
            body: JSON.stringify(datosFacturaActual())
        });
        await cargarDatosFacturacion();
        limpiarFactura();
        mostrarNotificacion("Factura guardada correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo guardar la factura.", "error");
    }
}

function facturaDesdeFormulario() {
    const precioServicio = parseFloat(document.getElementById("precioServicio").value) || 0;
    const repuestosMonto = detallesFactura.reduce((suma, item) => suma + item.cantidad * item.precio, 0);
    return {
        numero: document.getElementById("numeroFactura").value || "Factura",
        fecha: document.getElementById("fechaFactura").value || hoyIso(),
        cliente: document.getElementById("clienteFactura").value || "Sin cliente",
        tecnico: document.getElementById("tecnicoFactura").value || "Sin tecnico",
        servicio: document.getElementById("servicioFactura").value || "Servicio no seleccionado",
        dispositivo: servicioSeleccionado?.dispositivo || "Sin dispositivo",
        metodoPago: document.getElementById("metodoPagoFactura").value,
        estado: document.getElementById("estadoFactura").value,
        garantia: document.getElementById("garantiaFactura").value,
        montoServicio: precioServicio,
        total: precioServicio + repuestosMonto,
        productos: detallesFactura.map(item => ({ ...item, subtotal: item.cantidad * item.precio }))
    };
}

function imprimirFactura(factura = null) {
    const data = factura || facturaDesdeFormulario();
    const productos = data.productos || [];
    const repuestosHtml = productos.length
        ? productos.map(item => `
            <tr>
                <td>${escaparHtml(item.producto || item.nombre)}</td>
                <td>${item.cantidad}</td>
                <td>${moneda(item.precio)}</td>
                <td>${moneda(item.subtotal || item.cantidad * item.precio)}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="4">Sin repuestos agregados</td></tr>`;

    const ventana = window.open("", "_blank");
    if (!ventana) {
        mostrarNotificacion("El navegador bloqueo la ventana de impresion.");
        return;
    }

    ventana.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>${escaparHtml(data.numero)}</title>
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
            <p class="muted">Factura ${escaparHtml(data.numero)}</p>
            <div class="info">
                <div><strong>Fecha:</strong> ${escaparHtml(data.fecha)}</div>
                <div><strong>Cliente:</strong> ${escaparHtml(data.cliente)}</div>
                <div><strong>Dispositivo:</strong> ${escaparHtml(data.dispositivo)}</div>
                <div><strong>Tecnico:</strong> ${escaparHtml(data.tecnico)}</div>
                <div><strong>Servicio:</strong> ${escaparHtml(data.servicio)}</div>
                <div><strong>Metodo de pago:</strong> ${escaparHtml(data.metodoPago)}</div>
                <div><strong>Estado:</strong> ${escaparHtml(data.estado)}</div>
                <div><strong>Garantia:</strong> ${escaparHtml(data.garantia)}</div>
            </div>
            <table>
                <thead>
                    <tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr>
                </thead>
                <tbody>${repuestosHtml}</tbody>
            </table>
            <p class="total">Total: ${moneda(data.total)}</p>
            <script>window.print();<\/script>
        </body>
        </html>
    `);
    ventana.document.close();
}

async function cargarDatosFacturacion() {
    const [serviciosData, facturasData] = await Promise.all([
        apiJson("/facturacion/servicios-completados/"),
        apiJson("/facturacion/")
    ]);

    serviciosCompletados = serviciosData.servicios || [];
    facturas = facturasData.facturas || [];
    pintarServiciosCompletados();
    generarNumeroFactura();
    renderHistorialFacturas(facturas);
    preseleccionarSolicitudUrl();
}

function conectarEventos() {
    document.getElementById("solicitudFactura").addEventListener("change", event => seleccionarServicio(event.target.value));
    document.getElementById("precioServicio").addEventListener("input", actualizarResumen);

    document.getElementById("btnAgregarProductoFactura").addEventListener("click", () => {
        const producto = document.getElementById("productoFactura").value.trim();
        const cantidad = parseInt(document.getElementById("cantidadProducto").value, 10);
        const precio = parseFloat(document.getElementById("precioProducto").value);

        if (!producto || Number.isNaN(cantidad) || Number.isNaN(precio)) {
            mostrarNotificacion("Completa producto, cantidad y precio.");
            return;
        }

        if (producto.length < 3) {
            mostrarNotificacion("El producto debe tener al menos 3 caracteres.");
            return;
        }

        if (!esCantidadValida(cantidad)) {
            mostrarNotificacion("La cantidad debe ser un numero entero mayor que 0.");
            return;
        }

        if (!esMontoValido(precio)) {
            mostrarNotificacion("El precio del producto debe ser de 0 en adelante.");
            return;
        }

        detallesFactura.push({ producto, cantidad, precio });
        document.getElementById("productoFactura").value = "";
        document.getElementById("cantidadProducto").value = "";
        document.getElementById("precioProducto").value = "";
        renderDetalleFactura();
    });

    document.getElementById("btnGuardarFactura").addEventListener("click", guardarFactura);
    document.getElementById("btnCancelarFactura").addEventListener("click", limpiarFactura);
    document.getElementById("btnImprimirFactura").addEventListener("click", () => imprimirFactura());

    document.getElementById("btnHistorialFacturas").addEventListener("click", () => {
        const resumen = facturas.length
            ? facturas.map(factura => `${factura.numero} - ${factura.cliente}: ${moneda(factura.total)} (${factura.estado})`).join("\n")
            : "Todavia no hay facturas registradas.";
        mostrarNotificacion(`Historial actual de facturacion:\n\n${resumen}`, "info");
    });

    document.getElementById("btnExportarFacturas").addEventListener("click", () => {
        const filas = facturas.map(factura => [
            factura.numero,
            factura.fecha,
            factura.cliente,
            factura.tecnico,
            Number(factura.total).toFixed(2),
            factura.metodoPago,
            factura.estado
        ]);

        descargarCsv(
            "reporte_facturas.csv",
            ["Factura", "Fecha", "Cliente", "Tecnico", "Total", "Metodo de pago", "Estado"],
            filas
        );
        mostrarNotificacion("Reporte de facturacion exportado correctamente.", "success");
    });

    document.getElementById("buscarFactura").addEventListener("input", event => {
        const texto = event.target.value.toLowerCase();
        const filtradas = facturas.filter(factura =>
            factura.numero.toLowerCase().includes(texto) ||
            factura.cliente.toLowerCase().includes(texto) ||
            factura.tecnico.toLowerCase().includes(texto) ||
            factura.servicio.toLowerCase().includes(texto)
        );
        renderHistorialFacturas(filtradas);
    });
}

async function iniciarFacturacion() {
    conectarEventos();
    document.getElementById("fechaFactura").value = hoyIso();
    renderDetalleFactura();

    try {
        await cargarDatosFacturacion();
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo cargar facturacion.", "error");
        pintarServiciosCompletados();
        renderHistorialFacturas([]);
    }
}

iniciarFacturacion();
