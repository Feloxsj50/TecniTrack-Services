// ===============================
// CONFIG GLOBAL DE COLORES
// ===============================
const colorTexto = "#ffffff";
const colorGrid = "rgba(255,255,255,0.08)";

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
            borderColor: "#00e5ff",
            backgroundColor: "rgba(0,229,255,0.15)",
            fill: true,
            tension: 0.35,
            pointBackgroundColor: "#00e5ff",
            pointBorderColor: "#ffffff",
            pointRadius: 5
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colorTexto }
            }
        },
        scales: {
            x: {
                ticks: { color: colorTexto },
                grid: { color: colorGrid }
            },
            y: {
                ticks: { color: colorTexto },
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
            backgroundColor: ["#00ff99", "#3399ff", "#ffcc00"],
            borderColor: "#0a0f2c",
            borderWidth: 3
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colorTexto }
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
            backgroundColor: "#22c55e",
            borderRadius: 8
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colorTexto }
            }
        },
        scales: {
            x: {
                ticks: { color: colorTexto },
                grid: { color: colorGrid }
            },
            y: {
                ticks: { color: colorTexto },
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
        labels: ["Pantalla", "Batería", "Limpieza", "Diagnóstico"],
        datasets: [{
            label: "Servicios",
            data: [35, 22, 18, 15],
            backgroundColor: ["#3399ff", "#00ff99", "#ffcc00", "#ff6699"],
            borderRadius: 8
        }]
    },
    options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colorTexto }
            }
        },
        scales: {
            x: {
                ticks: { color: colorTexto },
                grid: { color: colorGrid }
            },
            y: {
                ticks: { color: colorTexto },
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
        csv += "Cambio de Batería,22\n";
        csv += "Limpieza Interna,18\n";
        csv += "Diagnóstico,15\n";

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const enlace = document.createElement("a");
        enlace.href = URL.createObjectURL(blob);
        enlace.download = "reporte_files.csv";
        enlace.click();
    });
}

