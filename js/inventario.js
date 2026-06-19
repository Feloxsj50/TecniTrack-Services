const productos = [
    {
        id: "PR-001",
        nombre: "SSD 1TB Samsung",
        categoria: "Almacenamiento",
        stock: 25,
        stockMinimo: 5,
        compra: 40,
        venta: 65,
        ubicacion: "Estante A-1"
    },
    {
        id: "PR-002",
        nombre: "Batería HP",
        categoria: "Baterías",
        stock: 4,
        stockMinimo: 5,
        compra: 25,
        venta: 45,
        ubicacion: "Estante B-2"
    },
    {
        id: "PR-003",
        nombre: "Pantalla Dell",
        categoria: "Pantallas",
        stock: 0,
        stockMinimo: 2,
        compra: 80,
        venta: 120,
        ubicacion: "Estante C-1"
    }
];

const tbody = document.querySelector("#tablaInventario tbody");
const busqueda = document.getElementById("busquedaProducto");

// Índice del producto que se está editando (-1 = modo agregar)
let indiceEditando = -1;

function esEnteroNoNegativo(valor) {
    return Number.isInteger(valor) && valor >= 0;
}

function esPrecioValido(valor) {
    return Number.isFinite(valor) && valor >= 0;
}

function generarIdProducto() {
    const mayorId = productos.reduce((mayor, producto) => {
        const numero = parseInt(producto.id.replace("PR-", ""), 10);
        return Number.isNaN(numero) ? mayor : Math.max(mayor, numero);
    }, 0);

    return `PR-${String(mayorId + 1).padStart(3, "0")}`;
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

    lista.forEach((producto, index) => {
        const estado = obtenerEstado(producto.stock, producto.stockMinimo);

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${producto.id}</td>
            <td>${producto.nombre}</td>
            <td>${producto.categoria}</td>
            <td>${producto.stock}</td>
            <td>$${producto.compra.toFixed(2)}</td>
            <td>$${producto.venta.toFixed(2)}</td>
            <td>${producto.ubicacion}</td>
            <td><span class="${claseEstado(estado)}">${estado}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn-editar-historial" data-index="${productos.indexOf(producto)}">
                        <i class="fa fa-pen"></i> Editar
                    </button>
                    <button class="btn-eliminar-tabla" data-index="${productos.indexOf(producto)}">
                        <i class="fa fa-trash"></i> Eliminar
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Eventos de editar
    tbody.querySelectorAll(".btn-editar-historial").forEach(btn => {
        btn.addEventListener("click", () => {
            const i = parseInt(btn.getAttribute("data-index"));
            cargarProductoEnFormulario(i);
        });
    });

    tbody.querySelectorAll(".btn-eliminar-tabla").forEach(btn => {
        btn.addEventListener("click", async () => {
            const index = parseInt(btn.getAttribute("data-index"), 10);
            const producto = productos[index];
            const confirmado = await confirmarAccion({
                titulo: "Eliminar producto",
                mensaje: `¿Seguro que querés eliminar ${producto.nombre} del inventario?`
            });

            if (!confirmado) return;

            productos.splice(index, 1);
            if (indiceEditando === index) {
                limpiarFormulario();
            } else if (indiceEditando > index) {
                indiceEditando--;
            }

            renderizarTabla(productos);
            actualizarCards();
            mostrarNotificacion("Producto eliminado correctamente.", "success");
        });
    });
}

function cargarProductoEnFormulario(index) {
    const p = productos[index];
    indiceEditando = index;

    document.getElementById("nombreProducto").value      = p.nombre;
    document.getElementById("categoriaProducto").value   = p.categoria;
    document.getElementById("proveedorProducto").value   = p.proveedor || "";
    document.getElementById("serieProducto").value       = p.serie || "";
    document.getElementById("stockProducto").value       = p.stock;
    document.getElementById("stockMinimoProducto").value = p.stockMinimo;
    document.getElementById("precioCompraProducto").value = p.compra;
    document.getElementById("precioVentaProducto").value  = p.venta;
    document.getElementById("ubicacionProducto").value   = p.ubicacion;
    document.getElementById("notaProducto").value        = p.nota || "";

    // Cambiar el botón a modo edición
    const btnGuardar = document.getElementById("btnAgregarProducto");
    btnGuardar.textContent = "Guardar cambios";
    btnGuardar.style.background = "rgba(34, 211, 238, 0.15)";
    btnGuardar.style.color = "#22d3ee";
    btnGuardar.style.borderColor = "rgba(34, 211, 238, 0.35)";

    // Scroll suave al formulario
    document.querySelector(".form-container").scrollIntoView({ behavior: "smooth" });
}

function actualizarCards() {
    let disponibles = 0, bajos = 0, agotados = 0, valorTotal = 0;

    productos.forEach(producto => {
        const estado = obtenerEstado(producto.stock, producto.stockMinimo);
        if (estado === "Disponible") disponibles++;
        else if (estado === "Bajo") bajos++;
        else agotados++;
        valorTotal += producto.stock * producto.compra;
    });

    document.getElementById("productosDisponibles").textContent = disponibles;
    document.getElementById("stockBajo").textContent = bajos;
    document.getElementById("productosAgotados").textContent = agotados;
    document.getElementById("valorInventario").textContent = `$${valorTotal.toFixed(2)}`;
}

function limpiarFormulario() {
    document.getElementById("nombreProducto").value       = "";
    document.getElementById("categoriaProducto").value    = "";
    document.getElementById("proveedorProducto").value    = "";
    document.getElementById("serieProducto").value        = "";
    document.getElementById("stockProducto").value        = "";
    document.getElementById("stockMinimoProducto").value  = "";
    document.getElementById("precioCompraProducto").value = "";
    document.getElementById("precioVentaProducto").value  = "";
    document.getElementById("ubicacionProducto").value    = "";
    document.getElementById("notaProducto").value         = "";

    // Restaurar botón a modo agregar
    indiceEditando = -1;
    const btnGuardar = document.getElementById("btnAgregarProducto");
    btnGuardar.textContent = "Añadir";
    btnGuardar.style.background = "";
    btnGuardar.style.color = "";
    btnGuardar.style.borderColor = "";
}

document.getElementById("btnAgregarProducto").addEventListener("click", () => {
    const nombre     = document.getElementById("nombreProducto").value.trim();
    const categoria  = document.getElementById("categoriaProducto").value;
    const proveedor  = document.getElementById("proveedorProducto").value.trim();
    const serie      = document.getElementById("serieProducto").value.trim();
    const stock      = parseInt(document.getElementById("stockProducto").value);
    const stockMinimo = parseInt(document.getElementById("stockMinimoProducto").value);
    const compra     = parseFloat(document.getElementById("precioCompraProducto").value);
    const venta      = parseFloat(document.getElementById("precioVentaProducto").value);
    const ubicacion  = document.getElementById("ubicacionProducto").value.trim();
    const nota       = document.getElementById("notaProducto").value.trim();

    if (!nombre || !categoria || isNaN(stock) || isNaN(stockMinimo) || isNaN(compra) || isNaN(venta) || !ubicacion) {
        mostrarNotificacion("Completa los campos obligatorios.");
        return;
    }

    if (nombre.length < 3) {
        mostrarNotificacion("El nombre del producto debe tener al menos 3 caracteres.");
        return;
    }

    if (!esEnteroNoNegativo(stock) || !esEnteroNoNegativo(stockMinimo)) {
        mostrarNotificacion("El stock y el stock mínimo deben ser números enteros de 0 en adelante.");
        return;
    }

    if (!esPrecioValido(compra) || !esPrecioValido(venta)) {
        mostrarNotificacion("Los precios deben ser números de 0 en adelante.");
        return;
    }

    if (venta < compra) {
        mostrarNotificacion("El precio de venta no puede ser menor que el precio de compra.");
        return;
    }

    if (indiceEditando >= 0) {
        // Modo edición - actualizar producto existente
        productos[indiceEditando] = {
            ...productos[indiceEditando],
            nombre, categoria, proveedor, serie,
            stock, stockMinimo, compra, venta, ubicacion, nota
        };
    } else {
        // Modo agregar - nuevo producto
        productos.push({
            id: generarIdProducto(),
            nombre, categoria, proveedor, serie,
            stock, stockMinimo, compra, venta, ubicacion, nota
        });
    }

    renderizarTabla(productos);
    actualizarCards();
    limpiarFormulario();
    mostrarNotificacion("Producto guardado correctamente.", "success");
});

document.getElementById("btnCancelarProducto").addEventListener("click", limpiarFormulario);

busqueda.addEventListener("input", () => {
    const texto = busqueda.value.toLowerCase();
    const filtrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(texto) ||
        p.categoria.toLowerCase().includes(texto) ||
        p.id.toLowerCase().includes(texto)
    );
    renderizarTabla(filtrados);
});

document.getElementById("btnHistorial").addEventListener("click", () => {
    const resumen = productos
        .map(producto => {
            const estado = obtenerEstado(producto.stock, producto.stockMinimo);
            return `${producto.id} - ${producto.nombre}: ${producto.stock} unidades (${estado})`;
        })
        .join("\n");

    mostrarNotificacion(`Historial actual de inventario:\n\n${resumen}`, "info");
});

document.getElementById("btnExportar").addEventListener("click", () => {
    const filas = productos.map(producto => {
        const estado = obtenerEstado(producto.stock, producto.stockMinimo);
        return [
            producto.id,
            producto.nombre,
            producto.categoria,
            producto.stock,
            producto.stockMinimo,
            producto.compra.toFixed(2),
            producto.venta.toFixed(2),
            producto.ubicacion,
            estado
        ];
    });

    descargarCsv(
        "reporte_inventario.csv",
        ["ID", "Producto", "Categoría", "Stock", "Stock mínimo", "Precio compra", "Precio venta", "Ubicación", "Estado"],
        filas
    );
    mostrarNotificacion("Reporte de inventario exportado correctamente.", "success");
});

renderizarTabla(productos);
actualizarCards();


