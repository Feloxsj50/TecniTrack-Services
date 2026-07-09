const API_BASE = window.location.origin;
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
    facturas: [],
    servicios: [],
    clientes: []
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

function agruparPorSemana(facturas) {
    const semanas = [0, 0, 0, 0];
    facturas.forEach(factura => {
        const dia = Number((factura.fecha || "").slice(8, 10));
        const indice = Math.min(3, Math.max(0, Math.ceil((dia || 1) / 7) - 1));
        semanas[indice] += Number(factura.total || 0);
    });
    return semanas;
}

function agruparMetodos(facturas) {
    const metodos = { Efectivo: 0, Transferencia: 0, Tarjeta: 0 };
    facturas.forEach(factura => {
        const metodo = factura.metodoPago || "Efectivo";
        metodos[metodo] = (metodos[metodo] || 0) + Number(factura.total || 0);
    });
    return metodos;
}

function agruparIngresosDia(facturas) {
    const dias = new Map();
    facturas.forEach(factura => {
        const dia = (factura.fecha || "").slice(8, 10) || "--";
        dias.set(dia, (dias.get(dia) || 0) + Number(factura.total || 0));
    });
    const ordenados = [...dias.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
    return ordenados.length ? ordenados : [["0", 0]];
}

function serviciosMasSolicitados(servicios) {
    const conteo = new Map();
    servicios.forEach(servicio => {
        const nombre = servicio.servicio || "Sin servicio";
        conteo.set(nombre, (conteo.get(nombre) || 0) + 1);
    });
    const ordenados = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return ordenados.length ? ordenados : [["Sin datos", 0]];
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
    const facturas = reporteActual.facturas;
    const pagadas = facturas.filter(factura => factura.estado === "Pagado");
    const pendientes = facturas.filter(factura => factura.estado === "Pendiente");
    const clientesAtendidos = new Set(facturas.map(factura => factura.cliente).filter(Boolean));

    document.getElementById("reporteIngresos").textContent = moneda(pagadas.reduce((total, factura) => total + Number(factura.total || 0), 0));
    document.getElementById("reporteFacturas").textContent = facturas.length;
    document.getElementById("reportePendientes").textContent = moneda(pendientes.reduce((total, factura) => total + Number(factura.total || 0), 0));
    document.getElementById("reporteClientes").textContent = clientesAtendidos.size || reporteActual.clientes.length;
}

function pintarGraficos() {
    destruirCharts();
    const facturas = reporteActual.facturas;
    const servicios = reporteActual.servicios;
    const semanas = agruparPorSemana(facturas);
    const metodos = agruparMetodos(facturas);
    const ingresosDia = agruparIngresosDia(facturas);
    const topServicios = serviciosMasSolicitados(servicios);

    charts.push(new Chart(document.getElementById("graficaVentas"), {
        type: "line",
        data: {
            labels: ["Semana 1", "Semana 2", "Semana 3", "Semana 4"],
            datasets: [{
                label: "Ventas",
                data: semanas,
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
            labels: Object.keys(metodos),
            datasets: [{
                data: Object.values(metodos),
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
            labels: ingresosDia.map(item => item[0]),
            datasets: [{
                label: "Ingresos",
                data: ingresosDia.map(item => item[1]),
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
            labels: topServicios.map(item => item[0]),
            datasets: [{
                label: "Servicios",
                data: topServicios.map(item => item[1]),
                backgroundColor: ["rgba(139,92,246,0.78)", "rgba(34,211,238,0.72)", "rgba(74,222,128,0.68)", "rgba(251,146,60,0.72)", "rgba(248,113,113,0.68)"],
                borderColor: [coloresTecniTrack.morado, coloresTecniTrack.cyan, coloresTecniTrack.verde, coloresTecniTrack.naranja, "#f87171"],
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: { ...opcionesBase(), indexAxis: "y" }
    }));
}

function exportarCsv() {
    const facturas = reporteActual.facturas;
    const pagadas = facturas.filter(factura => factura.estado === "Pagado");
    const pendientes = facturas.filter(factura => factura.estado === "Pendiente");
    let csv = "Reporte,Valor\n";
    csv += `Ingresos Totales,${pagadas.reduce((total, factura) => total + Number(factura.total || 0), 0).toFixed(2)}\n`;
    csv += `Facturas Emitidas,${facturas.length}\n`;
    csv += `Pagos Pendientes,${pendientes.reduce((total, factura) => total + Number(factura.total || 0), 0).toFixed(2)}\n`;
    csv += `Clientes Atendidos,${new Set(facturas.map(factura => factura.cliente).filter(Boolean)).size}\n`;
    csv += "\nServicio,Cantidad\n";
    serviciosMasSolicitados(reporteActual.servicios).forEach(([servicio, cantidad]) => {
        csv += `${servicio},${cantidad}\n`;
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
        const [facturas, servicios, clientes] = await Promise.all([
            cargarJson("/facturacion/"),
            cargarJson("/servicios/"),
            cargarJson("/clientes/")
        ]);
        reporteActual = {
            facturas: facturas.facturas || [],
            servicios: servicios.solicitudes || [],
            clientes: clientes.clientes || []
        };
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