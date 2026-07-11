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

document.querySelector(".btn-pdf")?.addEventListener("click", () => window.print());
document.querySelector(".btn-print")?.addEventListener("click", () => window.print());
document.querySelector(".btn-excel")?.addEventListener("click", exportarCsv);

iniciarReportes();
