// ===============================
// CONFIG GLOBAL DE COLORES
// ===============================
const colorTexto = "#f1f5f9";
const colorTextoSecundario = "#94a3b8";
const colorGrid = "rgba(148,163,184,0.12)";
const coloresTecniTrack = {
    morado: "#8b5cf6",
    cyan: "#22d3ee",
    verde: "#4ade80",
    naranja: "#fb923c",
    rojo: "#f87171",
    panel: "#10162d"
};

// ===============================
// GRAFICA 1 - VENTAS MENSUALES
// ===============================
new Chart(document.getElementById("graficaVentas"), {
    type: "line",
    data: {
        labels: ["Semana 1", "Semana 2", "Semana 3", "Semana 4"],
        datasets: [{
            label: "Ventas",
            data: [1200, 3000, 3500, 4850],
            borderColor: coloresTecniTrack.cyan,
            backgroundColor: "rgba(34,211,238,0.12)",
            fill: true,
            tension: 0.35,
            pointBackgroundColor: coloresTecniTrack.cyan,
            pointBorderColor: coloresTecniTrack.panel,
            pointRadius: 5
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colorTextoSecundario }
            }
        },
        scales: {
            x: {
                ticks: { color: colorTextoSecundario },
                grid: { color: colorGrid }
            },
            y: {
                ticks: { color: colorTextoSecundario },
                grid: { color: colorGrid }
            }
        }
    }
});

// ===============================
// GRAFICA 2 - METODOS DE PAGO
// ===============================
new Chart(document.getElementById("graficaPagos"), {
    type: "doughnut",
    data: {
        labels: ["Efectivo", "Transferencia", "Tarjeta"],
        datasets: [{
            data: [2100, 1800, 950],
            backgroundColor: [
                "rgba(139,92,246,0.88)",
                "rgba(34,211,238,0.88)",
                "rgba(251,146,60,0.88)"
            ],
            borderColor: coloresTecniTrack.panel,
            borderWidth: 3
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colorTextoSecundario }
            }
        }
    }
});

// ===============================
// GRAFICA 3 - INGRESOS POR DIA
// ===============================
new Chart(document.getElementById("graficaIngresosDia"), {
    type: "bar",
    data: {
        labels: ["1", "5", "10", "15", "20", "25", "28"],
        datasets: [{
            label: "Ingresos",
            data: [150, 200, 300, 250, 280, 320, 290],
            backgroundColor: "rgba(74,222,128,0.72)",
            borderColor: coloresTecniTrack.verde,
            borderWidth: 1,
            borderRadius: 8
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colorTextoSecundario }
            }
        },
        scales: {
            x: {
                ticks: { color: colorTextoSecundario },
                grid: { color: colorGrid }
            },
            y: {
                ticks: { color: colorTextoSecundario },
                grid: { color: colorGrid }
            }
        }
    }
});

// ===============================
// GRAFICA 4 - SERVICIOS MAS SOLICITADOS
// ===============================
new Chart(document.getElementById("graficaServicios"), {
    type: "bar",
    data: {
        labels: ["Pantalla", "Bateria", "Limpieza", "Diagnostico"],
        datasets: [{
            label: "Servicios",
            data: [35, 22, 18, 15],
            backgroundColor: [
                "rgba(139,92,246,0.78)",
                "rgba(34,211,238,0.72)",
                "rgba(74,222,128,0.68)",
                "rgba(251,146,60,0.72)"
            ],
            borderColor: [
                coloresTecniTrack.morado,
                coloresTecniTrack.cyan,
                coloresTecniTrack.verde,
                coloresTecniTrack.naranja
            ],
            borderWidth: 1,
            borderRadius: 8
        }]
    },
    options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colorTextoSecundario }
            }
        },
        scales: {
            x: {
                ticks: { color: colorTextoSecundario },
                grid: { color: colorGrid }
            },
            y: {
                ticks: { color: colorTextoSecundario },
                grid: { color: colorGrid }
            }
        }
    }
});

// ===============================
// EXPORTAR PDF / IMPRIMIR
// ===============================
const btnPdf = document.querySelector(".btn-pdf");
const btnPrint = document.querySelector(".btn-print");

if (btnPdf) {
    btnPdf.addEventListener("click", () => {
        window.print();
    });
}

if (btnPrint) {
    btnPrint.addEventListener("click", () => {
        window.print();
    });
}

// ===============================
// EXPORTAR EXCEL (CSV)
// ===============================
const btnExcel = document.querySelector(".btn-excel");

if (btnExcel) {
    btnExcel.addEventListener("click", () => {
        let csv = "Reporte,Valor\n";
        csv += "Ingresos Totales,4850\n";
        csv += "Facturas Emitidas,125\n";
        csv += "Pagos Pendientes,320\n";
        csv += "Clientes Atendidos,48\n";
        csv += "\n";
        csv += "Servicio,Cantidad\n";
        csv += "Cambio de Pantalla,35\n";
        csv += "Cambio de Bateria,22\n";
        csv += "Limpieza Interna,18\n";
        csv += "Diagnostico,15\n";

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const enlace = document.createElement("a");
        enlace.href = URL.createObjectURL(blob);
        enlace.download = "reporte_files.csv";
        enlace.click();
    });
}
