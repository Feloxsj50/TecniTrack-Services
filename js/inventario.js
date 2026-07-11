const API_BASE = (() => {
    const origin = window.location.origin;
    const localStaticPorts = ["5500", "5501", "5173"];

    if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
    if (localStaticPorts.includes(window.location.port)) {
        return window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
    }

    return origin;
})();
let productos = [];
let movimientos = [];
let productoEditandoId = null;
let csrfToken = "";
const sesionInventario = TecniAuth.obtenerSesion();
const puedeEditarInventario = sesionInventario?.rol === "admin";

const tbody = document.querySelector("#tablaInventario tbody");
const busqueda = document.getElementById("busquedaProducto");

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function leerRespuestaJson(respuesta) {
    const texto = await respuesta.text();
    try {
        return JSON.parse(texto);
    } catch {
        return { ok: false, error: "Django devolvió una respuesta no válida." };
    }
}

async function obtenerCsrfToken() {
    if (csrfToken) return csrfToken;
    const respuesta = await fetch(`${API_BASE}/usuarios/csrf/`, { credentials: "include" });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo preparar la seguridad de Django.");
    csrfToken = datos.csrfToken;
    return csrfToken;
}

async function apiJson(url, opciones = {}) {
    const respuesta = await fetch(`${API_BASE}${url}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": await obtenerCsrfToken(),
            ...(opciones.headers || {})
        },
        ...opciones
    });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) {
        throw new Error(datos.error || "No se pudo completar la acción.");
    }
    return datos;
}

function esEnteroNoNegativo(valor) {
    return Number.isInteger(valor) && valor >= 0;
}

function esPrecioValido(valor) {
    return Number.isFinite(valor) && valor >= 0;
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

function obtenerEstado(stock, stockMinimo) {
    if (stock === 0) return "Agotado";
    if (stock <= stockMinimo) return "Bajo";
    return "Disponible";
}

function claseEstado(estado) {
    if (estado === "Disponible") return "estado disponible";
    if (estado === "Bajo") return "estado bajo";
    return "estado agotado";
}

function renderizarTabla(lista) {
    tbody.innerHTML = "";

    if (!lista.length) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">
                    <div class="empty-state">
                        <i class="fa-solid fa-boxes-stacked"></i>
                        <strong>Sin productos registrados</strong>
                        <span>Cuando agregues productos al inventario, aparecerán aquí.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    lista.forEach(producto => {
        const estado = producto.estado || obtenerEstado(producto.stock, producto.stockMinimo);
        const tr = document.createElement("tr");
        const acciones = puedeEditarInventario ? `
            <div class="table-actions">
                <button class="btn-editar-historial" type="button" data-editar="${producto.dbId}">
                    <i class="fa fa-pen"></i> Editar
                </button>
                <button class="btn-eliminar-tabla" type="button" data-eliminar="${producto.dbId}">
                    <i class="fa fa-trash"></i> Eliminar
                </button>
            </div>
        ` : `<span class="estado disponible">Consulta</span>`;
        tr.innerHTML = `
            <td>${escaparHtml(producto.id)}</td>
            <td>${escaparHtml(producto.nombre)}</td>
            <td>${escaparHtml(producto.categoria)}</td>
            <td>${producto.stock}</td>
            <td>$${Number(producto.compra).toFixed(2)}</td>
            <td>$${Number(producto.venta).toFixed(2)}</td>
            <td>${escaparHtml(producto.ubicacion)}</td>
            <td><span class="${claseEstado(estado)}">${escaparHtml(estado)}</span></td>
            <td>${acciones}</td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-editar]").forEach(btn => {
        btn.addEventListener("click", () => cargarProductoEnFormulario(Number(btn.dataset.editar)));
    });

    tbody.querySelectorAll("[data-eliminar]").forEach(btn => {
        btn.addEventListener("click", () => eliminarProducto(Number(btn.dataset.eliminar)));
    });
}

function cargarProductoEnFormulario(productoId) {
    const p = productos.find(producto => producto.dbId === productoId);
    if (!p) return;

    productoEditandoId = p.dbId;
    document.getElementById("nombreProducto").value = p.nombre;
    document.getElementById("categoriaProducto").value = p.categoria;
    document.getElementById("proveedorProducto").value = p.proveedor || "";
    document.getElementById("serieProducto").value = p.serie || "";
    document.getElementById("stockProducto").value = p.stock;
    document.getElementById("stockMinimoProducto").value = p.stockMinimo;
    document.getElementById("precioCompraProducto").value = p.compra;
    document.getElementById("precioVentaProducto").value = p.venta;
    document.getElementById("ubicacionProducto").value = p.ubicacion;
    document.getElementById("notaProducto").value = p.nota || "";

    const btnGuardar = document.getElementById("btnAgregarProducto");
    btnGuardar.textContent = "Guardar cambios";
    btnGuardar.style.background = "rgba(34, 211, 238, 0.15)";
    btnGuardar.style.color = "#22d3ee";
    btnGuardar.style.borderColor = "rgba(34, 211, 238, 0.35)";

    document.querySelector(".form-container").scrollIntoView({ behavior: "smooth" });
}

function actualizarCards() {
    let disponibles = 0, bajos = 0, agotados = 0, valorTotal = 0;

    productos.forEach(producto => {
        const estado = producto.estado || obtenerEstado(producto.stock, producto.stockMinimo);
        if (estado === "Disponible") disponibles++;
        else if (estado === "Bajo") bajos++;
        else agotados++;
        valorTotal += Number(producto.stock) * Number(producto.compra);
    });

    document.getElementById("productosDisponibles").textContent = disponibles;
    document.getElementById("stockBajo").textContent = bajos;
    document.getElementById("productosAgotados").textContent = agotados;
    document.getElementById("valorInventario").textContent = `$${valorTotal.toFixed(2)}`;
}

function limpiarFormulario() {
    document.getElementById("nombreProducto").value = "";
    document.getElementById("categoriaProducto").value = "";
    document.getElementById("proveedorProducto").value = "";
    document.getElementById("serieProducto").value = "";
    document.getElementById("stockProducto").value = "";
    document.getElementById("stockMinimoProducto").value = "";
    document.getElementById("precioCompraProducto").value = "";
    document.getElementById("precioVentaProducto").value = "";
    document.getElementById("ubicacionProducto").value = "";
    document.getElementById("notaProducto").value = "";

    productoEditandoId = null;
    const btnGuardar = document.getElementById("btnAgregarProducto");
    btnGuardar.textContent = "Añadir";
    btnGuardar.style.background = "";
    btnGuardar.style.color = "";
    btnGuardar.style.borderColor = "";
}

function datosFormulario() {
    return {
        nombre: document.getElementById("nombreProducto").value.trim(),
        categoria: document.getElementById("categoriaProducto").value,
        proveedor: document.getElementById("proveedorProducto").value.trim(),
        serie: document.getElementById("serieProducto").value.trim(),
        stock: parseInt(document.getElementById("stockProducto").value, 10),
        stockMinimo: parseInt(document.getElementById("stockMinimoProducto").value, 10),
        compra: parseFloat(document.getElementById("precioCompraProducto").value),
        venta: parseFloat(document.getElementById("precioVentaProducto").value),
        ubicacion: document.getElementById("ubicacionProducto").value.trim(),
        nota: document.getElementById("notaProducto").value.trim(),
    };
}

function validarProducto(producto) {
    if (!producto.nombre || !producto.categoria || Number.isNaN(producto.stock) || Number.isNaN(producto.stockMinimo) || Number.isNaN(producto.compra) || Number.isNaN(producto.venta) || !producto.ubicacion) {
        mostrarNotificacion("Completa los campos obligatorios.", "error");
        return false;
    }

    if (producto.nombre.length < 3) {
        mostrarNotificacion("El nombre del producto debe tener al menos 3 caracteres.", "error");
        return false;
    }

    if (!esEnteroNoNegativo(producto.stock) || !esEnteroNoNegativo(producto.stockMinimo)) {
        mostrarNotificacion("El stock y el stock mínimo deben ser números enteros de 0 en adelante.", "error");
        return false;
    }

    if (!esPrecioValido(producto.compra) || !esPrecioValido(producto.venta)) {
        mostrarNotificacion("Los precios deben ser números de 0 en adelante.", "error");
        return false;
    }

    if (producto.venta < producto.compra) {
        mostrarNotificacion("El precio de venta no puede ser menor que el precio de compra.", "error");
        return false;
    }

    return true;
}

async function guardarProducto() {
    const payload = datosFormulario();
    if (!validarProducto(payload)) return;

    try {
        const url = productoEditandoId
            ? `/inventario/${productoEditandoId}/actualizar/`
            : "/inventario/crear/";
        await apiJson(url, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        await cargarInventario();
        limpiarFormulario();
        mostrarNotificacion("Producto guardado correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo guardar el producto.", "error");
    }
}

async function eliminarProducto(productoId) {
    const producto = productos.find(item => item.dbId === productoId);
    if (!producto) return;

    const confirmado = await confirmarAccion({
        titulo: "Eliminar producto",
        mensaje: `Seguro que quieres eliminar ${producto.nombre} del inventario?`
    });

    if (!confirmado) return;

    try {
        await apiJson(`/inventario/${productoId}/eliminar/`, { method: "POST" });
        if (productoEditandoId === productoId) limpiarFormulario();
        await cargarInventario();
        mostrarNotificacion("Producto eliminado correctamente.", "success");
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudo eliminar el producto.", "error");
    }
}

function filtrarProductos() {
    const texto = busqueda.value.toLowerCase();
    const filtrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(texto) ||
        p.categoria.toLowerCase().includes(texto) ||
        p.id.toLowerCase().includes(texto) ||
        String(p.ubicacion || "").toLowerCase().includes(texto)
    );
    renderizarTabla(filtrados);
}

async function cargarInventario() {
    try {
        const [respuesta, respuestaMovimientos] = await Promise.all([
            fetch(`${API_BASE}/inventario/`, { credentials: "include" }),
            fetch(`${API_BASE}/inventario/movimientos/`, { credentials: "include" })
        ]);
        const datos = await leerRespuestaJson(respuesta);
        const datosMovimientos = await leerRespuestaJson(respuestaMovimientos);
        if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo cargar el inventario.");
        if (!respuestaMovimientos.ok || !datosMovimientos.ok) throw new Error(datosMovimientos.error || "No se pudo cargar el historial.");

        productos = datos.productos || [];
        movimientos = datosMovimientos.movimientos || [];
        actualizarCards();
        filtrarProductos();
    } catch (error) {
        productos = [];
        actualizarCards();
        renderizarTabla([]);
        mostrarNotificacion(error.message || "No se pudo cargar el inventario.", "error");
    }
}

function mostrarHistorialInventario() {
    const resumen = productos.length
        ? productos.map(producto => `${producto.id} - ${producto.nombre}: ${producto.stock} unidades (${producto.estado})`).join("\n")
        : "Todavía no hay productos registrados.";

    mostrarNotificacion(`Inventario actual:\n\n${resumen}`, "info");
}

function exportarInventario() {
    const filas = productos.map(producto => [
        producto.id,
        producto.nombre,
        producto.categoria,
        producto.stock,
        producto.stockMinimo,
        Number(producto.compra).toFixed(2),
        Number(producto.venta).toFixed(2),
        producto.ubicacion,
        producto.estado
    ]);

    descargarCsv(
        "reporte_inventario.csv",
        ["ID", "Producto", "Categoría", "Stock", "Stock mínimo", "Precio compra", "Precio venta", "Ubicación", "Estado"],
        filas
    );
    mostrarNotificacion("Reporte de inventario exportado correctamente.", "success");
}

function mostrarHistorialMovimientos() {
    const resumen = movimientos.length
        ? movimientos.slice(0, 12).map(movimiento => {
            const signo = movimiento.cantidad > 0 ? "+" : "";
            return `${movimiento.producto} - ${movimiento.tipo}: ${signo}${movimiento.cantidad} (${movimiento.stockAnterior} → ${movimiento.stockNuevo})`;
        }).join("\n")
        : "Todavía no hay movimientos registrados.";

    mostrarNotificacion(`Historial de inventario:\n\n${resumen}`, "info");
}

function conectarEventos() {
    document.getElementById("btnAgregarProducto").addEventListener("click", guardarProducto);
    document.getElementById("btnCancelarProducto").addEventListener("click", limpiarFormulario);
    document.getElementById("btnHistorial").addEventListener("click", mostrarHistorialMovimientos);
    document.getElementById("btnExportar").addEventListener("click", exportarInventario);
    busqueda.addEventListener("input", filtrarProductos);
}

function iniciarInventario() {
    if (!puedeEditarInventario) {
        document.querySelector(".form-container")?.setAttribute("hidden", "hidden");
    }
    conectarEventos();
    cargarInventario();
}

iniciarInventario();
