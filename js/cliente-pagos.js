const pagosCliente = [
    {
        recibo: "REC-001",
        fecha: "2026-02-20",
        cliente: "Cliente TecniTrack",
        dispositivo: "Dell Inspiron",
        servicio: "Limpieza interna",
        tecnico: "Luis Canda",
        metodo: "Efectivo",
        garantia: "30 días",
        montoServicio: 25,
        repuestos: [{ nombre: "Pasta térmica", monto: 10 }],
        total: 35,
        estado: "Pagado"
    },
    {
        recibo: "REC-002",
        fecha: "2026-03-05",
        cliente: "Cliente TecniTrack",
        dispositivo: "Lenovo IdeaPad",
        servicio: "Cambio de batería",
        tecnico: "Natalia Ruiz",
        metodo: "Transferencia",
        garantia: "30 días",
        montoServicio: 30,
        repuestos: [{ nombre: "Batería compatible", monto: 40 }],
        total: 70,
        estado: "Pagado"
    },
    {
        recibo: "REC-003",
        fecha: "2026-04-12",
        cliente: "Cliente TecniTrack",
        dispositivo: "HP Pavilion",
        servicio: "Diagnóstico",
        tecnico: "Pedro López",
        metodo: "Tarjeta",
        garantia: "15 días",
        montoServicio: 20,
        repuestos: [],
        total: 20,
        estado: "Pagado"
    },
    {
        recibo: "REC-004",
        fecha: "2026-06-18",
        cliente: "Cliente TecniTrack",
        dispositivo: "HP Pavilion",
        servicio: "Cambio de pantalla",
        tecnico: "Pedro López",
        metodo: "Por definir",
        garantia: "30 días",
        montoServicio: 25,
        repuestos: [{ nombre: "Pantalla compatible", monto: 95 }],
        total: 120,
        estado: "Pendiente"
    }
];

const tablaPagos = document.querySelector("#tablaPagosCliente tbody");
const modalRecibo = document.getElementById("reciboModal");
let reciboActual = null;

function moneda(valor) {
    return new Intl.NumberFormat("es-NI", {
        style: "currency",
        currency: "USD"
    }).format(valor);
}

function fechaLegible(fecha) {
    return new Intl.DateTimeFormat("es-NI", {
        year: "numeric",
        month: "short",
        day: "2-digit"
    }).format(new Date(fecha + "T12:00:00"));
}

function escaparHtml(valor) {
    return String(valor)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function actualizarResumen() {
    const pagados = pagosCliente.filter(pago => pago.estado === "Pagado");
    const pendientes = pagosCliente.filter(pago => pago.estado === "Pendiente");
    const totalPagado = pagados.reduce((total, pago) => total + pago.total, 0);
    const saldoPendiente = pendientes.reduce((total, pago) => total + pago.total, 0);
    const ultimoPago = pagados.slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0];

    document.getElementById("totalPagado").textContent = moneda(totalPagado);
    document.getElementById("saldoPendiente").textContent = moneda(saldoPendiente);
    document.getElementById("pagosRealizados").textContent = pagados.length;
    document.getElementById("ultimaGarantia").textContent = ultimoPago?.garantia || "—";
}

function cargarPagoPendiente() {
    const pendiente = pagosCliente.find(pago => pago.estado === "Pendiente");
    const panel = document.getElementById("pagoPendiente");

    if (!pendiente) {
        panel.classList.add("sin-pendiente");
        return;
    }

    const totalRepuestos = pendiente.repuestos.reduce((total, item) => total + item.monto, 0);
    document.getElementById("pendienteServicio").textContent = pendiente.servicio;
    document.getElementById("pendienteDispositivo").textContent = pendiente.dispositivo;
    document.getElementById("pendienteTecnico").textContent = pendiente.tecnico;
    document.getElementById("pendienteServicioMonto").textContent = moneda(pendiente.montoServicio);
    document.getElementById("pendienteRepuestos").textContent = moneda(totalRepuestos);
    document.getElementById("pendienteTotal").textContent = moneda(pendiente.total);
    document.getElementById("btnVerPendiente").addEventListener("click", () => abrirRecibo(pendiente));
}

function renderizarHistorial(lista) {
    tablaPagos.innerHTML = "";
    const pagados = lista.filter(pago => pago.estado === "Pagado");

    pagados.forEach(pago => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${escaparHtml(pago.recibo)}</td>
            <td>${fechaLegible(pago.fecha)}</td>
            <td>${escaparHtml(pago.servicio)}</td>
            <td>${escaparHtml(pago.tecnico)}</td>
            <td>${escaparHtml(pago.metodo)}</td>
            <td>${moneda(pago.total)}</td>
            <td><span class="estado-factura pagado">Pagado</span></td>
            <td>
                <button type="button" class="btn-ver-recibo" data-recibo="${pago.recibo}">
                    <i class="fa-solid fa-receipt"></i> Ver
                </button>
            </td>
        `;
        tablaPagos.appendChild(fila);
    });

    document.getElementById("cantidadResultados").textContent =
        `${pagados.length} ${pagados.length === 1 ? "recibo" : "recibos"}`;

    tablaPagos.querySelectorAll("[data-recibo]").forEach(boton => {
        boton.addEventListener("click", () => {
            const pago = pagosCliente.find(item => item.recibo === boton.dataset.recibo);
            abrirRecibo(pago);
        });
    });
}

function contenidoRecibo(pago) {
    const repuestos = pago.repuestos.length
        ? pago.repuestos.map(item => `
            <div class="recibo-linea">
                <span>${escaparHtml(item.nombre)}</span>
                <strong>${moneda(item.monto)}</strong>
            </div>
        `).join("")
        : `<div class="recibo-linea"><span>Repuestos</span><strong>${moneda(0)}</strong></div>`;

    return `
        <div class="recibo-cabecera">
            <h2 id="reciboTitulo">TecniTrack Services</h2>
            <p>${escaparHtml(pago.recibo)} · ${pago.estado}</p>
        </div>
        <div class="recibo-meta">
            <div><span>Cliente</span><strong>${escaparHtml(pago.cliente)}</strong></div>
            <div><span>Fecha</span><strong>${fechaLegible(pago.fecha)}</strong></div>
            <div><span>Dispositivo</span><strong>${escaparHtml(pago.dispositivo)}</strong></div>
            <div><span>Técnico</span><strong>${escaparHtml(pago.tecnico)}</strong></div>
            <div><span>Método</span><strong>${escaparHtml(pago.metodo)}</strong></div>
            <div><span>Garantía</span><strong>${escaparHtml(pago.garantia)}</strong></div>
        </div>
        <div class="recibo-lineas">
            <div class="recibo-linea">
                <span>${escaparHtml(pago.servicio)}</span>
                <strong>${moneda(pago.montoServicio)}</strong>
            </div>
            ${repuestos}
        </div>
        <div class="recibo-total"><span>Total</span><strong>${moneda(pago.total)}</strong></div>
    `;
}

function abrirRecibo(pago) {
    reciboActual = pago;
    document.getElementById("reciboContenido").innerHTML = contenidoRecibo(pago);
    modalRecibo.hidden = false;
    document.body.classList.add("modal-open");
    modalRecibo.querySelector(".recibo-cerrar").focus();
}

function cerrarRecibo() {
    modalRecibo.hidden = true;
    document.body.classList.remove("modal-open");
}

function imprimirRecibo() {
    if (!reciboActual) return;
    const ventana = window.open("", "_blank");

    if (!ventana) {
        mostrarNotificacion("El navegador bloqueó la ventana de impresión.");
        return;
    }

    ventana.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>${escaparHtml(reciboActual.recibo)}</title>
            <style>
                body { font-family: Arial, sans-serif; color: #111827; max-width: 680px; margin: 0 auto; padding: 36px; }
                h2 { margin-bottom: 4px; } p { color: #6b7280; }
                .recibo-meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 24px; margin: 24px 0; }
                .recibo-meta span, .recibo-linea span { color: #6b7280; font-size: 12px; }
                .recibo-meta strong { display: block; margin-top: 3px; }
                .recibo-linea, .recibo-total { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
                .recibo-total { margin-top: 12px; font-size: 20px; font-weight: 700; }
            </style>
        </head>
        <body>${contenidoRecibo(reciboActual)}<script>window.print();<\/script></body>
        </html>
    `);
    ventana.document.close();
}

document.getElementById("buscarPago").addEventListener("input", event => {
    const texto = event.target.value.trim().toLowerCase();
    const filtrados = pagosCliente.filter(pago =>
        pago.recibo.toLowerCase().includes(texto) ||
        pago.servicio.toLowerCase().includes(texto) ||
        pago.tecnico.toLowerCase().includes(texto)
    );
    renderizarHistorial(filtrados);
});

document.querySelectorAll("[data-cerrar-recibo]").forEach(elemento => {
    elemento.addEventListener("click", cerrarRecibo);
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modalRecibo.hidden) cerrarRecibo();
});

document.getElementById("btnImprimirRecibo").addEventListener("click", imprimirRecibo);

actualizarResumen();
cargarPagoPendiente();
renderizarHistorial(pagosCliente);
