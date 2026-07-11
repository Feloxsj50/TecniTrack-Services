const API_BASE = (() => {
    const origin = window.location.origin;
    const localStaticPorts = ["5500", "5501", "5173"];

    if (window.location.protocol === "file:") return "http://127.0.0.1:8000";
    if (localStaticPorts.includes(window.location.port)) {
        return window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
    }

    return origin;
})();
const colorTextoSecundario = "#94a3b8";
const colorGrid = "rgba(148,163,184,0.12)";
const coloresTecniTrack = {
    morado: "#8b5cf6",
    cyan: "#22d3ee",
    verde: "#4ade80",
    naranja: "#fb923c",
    panel: "#10162d"
};

let reporteActual = {
    cards: {
        ingresos: 0,
        facturas: 0,
        pendientes: 0,
        clientes: 0
    },
    graficos: {
        ventasSemanales: { labels: ["Semana 1", "Semana 2", "Semana 3", "Semana 4"], data: [0, 0, 0, 0] },
        metodosPago: { labels: ["Sin datos"], data: [0] },
        ingresosDia: { labels: ["0"], data: [0] },
        servicios: { labels: ["Sin datos"], data: [0] },
        ordenes: { labels: ["Sin datos"], data: [0] },
        tecnicos: { labels: ["Sin datos"], data: [0] },
        inventario: { labels: ["Sin datos"], data: [0] }
    },
    ordenes: {
        total: 0,
        pendientes: 0,
        enProceso: 0,
        completadas: 0,
        canceladas: 0,
        tecnicos: { labels: ["Sin datos"], data: [0] }
    },
    exportacion: []
};
let charts = [];

async function leerRespuestaJson(respuesta) {
    const texto = await respuesta.text();
    try {
        return JSON.parse(texto);
    } catch {
        return { ok: false, error: "Django devolvió una respuesta no válida." };
    }
}

async function cargarJson(url) {
    const respuesta = await fetch(`${API_BASE}${url}`, { credentials: "include" });
    const datos = await leerRespuestaJson(respuesta);
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error || "No se pudo cargar el reporte.");
    return datos;
}

function moneda(valor) {
    return `$${Number(valor || 0).toFixed(2)}`;
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function destruirCharts() {
    charts.forEach(chart => chart.destroy());
    charts = [];
}

function opcionesBase() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: colorTextoSecundario } } },
        scales: {
            x: { ticks: { color: colorTextoSecundario }, grid: { color: colorGrid } },
            y: { ticks: { color: colorTextoSecundario }, grid: { color: colorGrid } }
        }
    };
}

function pintarCards() {
    const cards = reporteActual.cards;
    document.getElementById("reporteIngresos").textContent = moneda(cards.ingresos);
    document.getElementById("reporteFacturas").textContent = cards.facturas;
    document.getElementById("reportePendientes").textContent = moneda(cards.pendientes);
    document.getElementById("reporteClientes").textContent = cards.clientes;
}

function pintarGraficos() {
    destruirCharts();
    const graficos = reporteActual.graficos;

    charts.push(new Chart(document.getElementById("graficaVentas"), {
        type: "line",
        data: {
            labels: graficos.ventasSemanales.labels,
            datasets: [{
                label: "Ventas",
                data: graficos.ventasSemanales.data,
                borderColor: coloresTecniTrack.cyan,
                backgroundColor: "rgba(34,211,238,0.12)",
                fill: true,
                tension: 0.35,
                pointBackgroundColor: coloresTecniTrack.cyan,
                pointBorderColor: coloresTecniTrack.panel,
                pointRadius: 5
            }]
        },
        options: opcionesBase()
    }));

    charts.push(new Chart(document.getElementById("graficaPagos"), {
        type: "doughnut",
        data: {
            labels: graficos.metodosPago.labels,
            datasets: [{
                data: graficos.metodosPago.data,
                backgroundColor: ["rgba(139,92,246,0.88)", "rgba(34,211,238,0.88)", "rgba(251,146,60,0.88)"],
                borderColor: coloresTecniTrack.panel,
                borderWidth: 3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: colorTextoSecundario } } } }
    }));

    charts.push(new Chart(document.getElementById("graficaIngresosDia"), {
        type: "bar",
        data: {
            labels: graficos.ingresosDia.labels,
            datasets: [{
                label: "Ingresos",
                data: graficos.ingresosDia.data,
                backgroundColor: "rgba(74,222,128,0.72)",
                borderColor: coloresTecniTrack.verde,
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: opcionesBase()
    }));

    charts.push(new Chart(document.getElementById("graficaServicios"), {
        type: "bar",
        data: {
            labels: graficos.servicios.labels,
            datasets: [{
                label: "Servicios",
                data: graficos.servicios.data,
                backgroundColor: ["rgba(139,92,246,0.78)", "rgba(34,211,238,0.72)", "rgba(74,222,128,0.68)", "rgba(251,146,60,0.72)", "rgba(248,113,113,0.68)"],
                borderColor: [coloresTecniTrack.morado, coloresTecniTrack.cyan, coloresTecniTrack.verde, coloresTecniTrack.naranja, "#f87171"],
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: { ...opcionesBase(), indexAxis: "y" }
    }));

    const graficasExtra = [
        ["graficaOrdenes", "ordenes", "Órdenes por estado", [coloresTecniTrack.naranja, coloresTecniTrack.cyan, coloresTecniTrack.verde, "#f87171"]],
        ["graficaTecnicos", "tecnicos", "Trabajos por técnico", [coloresTecniTrack.morado, coloresTecniTrack.cyan, coloresTecniTrack.verde, coloresTecniTrack.naranja]],
        ["graficaInventario", "inventario", "Inventario utilizado", [coloresTecniTrack.cyan, coloresTecniTrack.verde, coloresTecniTrack.naranja, coloresTecniTrack.morado]]
    ];
    graficasExtra.forEach(([id, clave, etiqueta, colores]) => {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        charts.push(new Chart(canvas, {
            type: "bar",
            data: { labels: graficos[clave].labels, datasets: [{ label: etiqueta, data: graficos[clave].data, backgroundColor: colores, borderRadius: 8 }] },
            options: opcionesBase()
        }));
    });
}

function exportarCsv() {
    let csv = "Reporte,Valor\n";
    csv += `Ingresos Totales,${Number(reporteActual.cards.ingresos || 0).toFixed(2)}\n`;
    csv += `Facturas Emitidas,${reporteActual.cards.facturas || 0}\n`;
    csv += `Pagos Pendientes,${Number(reporteActual.cards.pendientes || 0).toFixed(2)}\n`;
    csv += `Clientes Atendidos,${reporteActual.cards.clientes || 0}\n`;
    csv += `Ordenes Totales,${reporteActual.ordenes?.total || 0}\n`;
    csv += `Ordenes Pendientes,${reporteActual.ordenes?.pendientes || 0}\n`;
    csv += `Ordenes En Proceso,${reporteActual.ordenes?.enProceso || 0}\n`;
    csv += `Ordenes Completadas,${reporteActual.ordenes?.completadas || 0}\n`;
    csv += `Ordenes Canceladas,${reporteActual.ordenes?.canceladas || 0}\n`;
    csv += "\nServicio,Cantidad\n";
    reporteActual.graficos.servicios.labels.forEach((servicio, index) => {
        csv += `${servicio},${reporteActual.graficos.servicios.data[index] || 0}\n`;
    });
    csv += "\nFactura,Fecha,Cliente,Servicio,Método,Estado,Total\n";
    reporteActual.exportacion.forEach(factura => {
        csv += `${factura.numero},${factura.fecha},${factura.cliente},${factura.servicio},${factura.metodoPago},${factura.estado},${factura.total}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = "reporte_tecnitrack.csv";
    enlace.click();
    URL.revokeObjectURL(enlace.href);
}

function fechaReporte() {
    return new Intl.DateTimeFormat("es-NI", { dateStyle: "medium" }).format(new Date());
}

function filaReporte(celdas) {
    return `<tr>${celdas.map(celda => `<td>${escaparHtml(celda)}</td>`).join("")}</tr>`;
}

function contenidoReporte() {
    const ordenes = reporteActual.ordenes || {};
    const facturas = reporteActual.exportacion || [];
    const servicios = reporteActual.graficos.servicios || { labels: [], data: [] };
    const inventario = reporteActual.graficos.inventario || { labels: [], data: [] };

    return {
        ordenes,
        facturas,
        servicios,
        inventario,
        resumen: [
            ["Ingresos pagados", moneda(reporteActual.cards.ingresos)],
            ["Facturas emitidas", reporteActual.cards.facturas],
            ["Pagos pendientes", moneda(reporteActual.cards.pendientes)],
            ["Clientes atendidos", reporteActual.cards.clientes],
            ["Órdenes totales", ordenes.total || 0],
            ["Órdenes completadas", ordenes.completadas || 0]
        ]
    };
}

function exportarExcel() {
    const datos = contenidoReporte();
    const filasResumen = datos.resumen.map(item => filaReporte(item)).join("");
    const filasFacturas = datos.facturas.length
        ? datos.facturas.map(factura => filaReporte([factura.numero, factura.fecha, factura.cliente, factura.servicio, factura.metodoPago, factura.estado, factura.total])).join("")
        : filaReporte(["Sin facturas registradas"]);
    const filasServicios = datos.servicios.labels.map((label, index) => filaReporte([label, datos.servicios.data[index] || 0])).join("");
    const filasInventario = datos.inventario.labels.map((label, index) => filaReporte([label, datos.inventario.data[index] || 0])).join("");
    const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta charset="UTF-8"><style>
            body{font-family:Arial;color:#172033}h1{color:#512da8}h2{background:#512da8;color:white;padding:8px}table{border-collapse:collapse;width:100%;margin-bottom:20px}th{background:#22a6b3;color:white;padding:8px;text-align:left}td{border:1px solid #d7dce5;padding:7px}.number{font-weight:bold;color:#512da8}
        </style></head><body>
        <h1>TecniTrack Services - Reporte general</h1><p>Generado el ${escaparHtml(fechaReporte())}</p>
        <h2>Resumen</h2><table><tr><th>Indicador</th><th>Valor</th></tr>${filasResumen}</table>
        <h2>Facturas</h2><table><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Servicio</th><th>Método</th><th>Estado</th><th>Total</th></tr>${filasFacturas}</table>
        <h2>Servicios más solicitados</h2><table><tr><th>Servicio</th><th>Cantidad</th></tr>${filasServicios}</table>
        <h2>Inventario utilizado</h2><table><tr><th>Producto</th><th>Cantidad</th></tr>${filasInventario}</table>
        </body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = "reporte_tecnitrack.xls";
    enlace.style.display = "none";
    document.body.appendChild(enlace);
    enlace.click();
    setTimeout(() => {
        URL.revokeObjectURL(enlace.href);
        enlace.remove();
    }, 1000);
    mostrarNotificacion("Reporte de Excel generado correctamente.", "success");
}

function imprimirReportePdf() {
    const datos = contenidoReporte();
    const ventana = window.open("", "_blank");
    if (!ventana) return mostrarNotificacion("El navegador bloqueó la ventana del reporte.", "error");
    const resumen = datos.resumen.map(item => `<div class="metric"><span>${escaparHtml(item[0])}</span><strong>${escaparHtml(item[1])}</strong></div>`).join("");
    const facturas = datos.facturas.map(factura => filaReporte([factura.numero, factura.fecha, factura.cliente, factura.servicio, factura.estado, moneda(factura.total)])).join("");
    ventana.document.open();
    ventana.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte TecniTrack</title><style>
        @page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#172033;margin:0}header{border-bottom:4px solid #8b5cf6;padding-bottom:14px;margin-bottom:22px}h1{margin:0;color:#33206f;font-size:26px}h2{margin:22px 0 9px;color:#33206f;font-size:16px}.meta{color:#64748b;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.metric{border:1px solid #dbe1ea;border-top:3px solid #22d3ee;padding:10px}.metric span{display:block;color:#64748b;font-size:10px}.metric strong{display:block;margin-top:4px;font-size:16px}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#33206f;color:white;text-align:left;padding:7px}td{border-bottom:1px solid #dbe1ea;padding:7px}footer{margin-top:25px;color:#64748b;font-size:10px}@media print{.no-print{display:none}}
        </style></head><body><header><h1>TecniTrack Services</h1><p class="meta">Reporte general · ${escaparHtml(fechaReporte())}</p></header><div class="metrics">${resumen}</div><h2>Órdenes</h2><p>${datos.ordenes.total || 0} totales · ${datos.ordenes.pendientes || 0} pendientes · ${datos.ordenes.enProceso || 0} en proceso · ${datos.ordenes.completadas || 0} completadas</p><h2>Facturas emitidas</h2><table><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Servicio</th><th>Estado</th><th>Total</th></tr>${facturas || filaReporte(["Sin facturas registradas"])}</table><footer>Documento generado por TecniTrack Services</footer></body></html>`);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => ventana.print(), 500);
}

async function iniciarReportes() {
    try {
        const datos = await cargarJson("/dashboard/reportes/");
        reporteActual = datos.reporte || reporteActual;
        pintarCards();
        pintarGraficos();
    } catch (error) {
        mostrarNotificacion(error.message || "No se pudieron cargar los reportes.", "error");
        pintarCards();
        pintarGraficos();
    }
}

document.querySelector(".btn-pdf")?.addEventListener("click", imprimirReportePdf);
document.querySelector(".btn-print")?.addEventListener("click", () => window.print());
document.querySelector(".btn-excel")?.addEventListener("click", exportarExcel);

iniciarReportes();
