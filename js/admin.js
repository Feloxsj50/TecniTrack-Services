// ===============================
// MENU PRINCIPAL
// ===============================
const items = document.querySelectorAll(".menu-item");
const sections = document.querySelectorAll(".panel-section");

items.forEach(item => {
    item.addEventListener("click", (e) => {
        const sectionId = item.getAttribute("data-section");

        // Solo manejar con JS los enlaces internos
        if (sectionId) {
            e.preventDefault();

            // Quitar activo a todos
            items.forEach(i => i.classList.remove("active"));
            item.classList.add("active");

            // Ocultar todas las secciones
            sections.forEach(sec => sec.classList.remove("active-section"));

            // Mostrar sección seleccionada
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add("active-section");
            }
        }
        // Si NO tiene data-section, deja que navegue normal con href
    });
});

// ===============================
// CERRAR SESION
// ===============================
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        window.location.href = "index.html";
    });
}

// ===============================
// MINI BASE DE DATOS
// ===============================
const serviciosIniciales = [
    {
        id: 1414234234324,
        cliente: "Juan Quintanilla",
        dispositivo: "Dell",
        servicio: "Pantalla",
        fecha: "2025-01-01",
        estado: "Pendiente"
    },
    {
        id: 224325235235,
        cliente: "Maria Candas",
        dispositivo: "HP",
        servicio: "Formateo",
        fecha: "2025-01-02",
        estado: "Pendiente"
    },
    {
        id: 343242342342,
        cliente: "Carlos Lopez",
        dispositivo: "HP",
        servicio: "Batería",
        fecha: "2025-01-03",
        estado: "Completado"
    }
];

// Revisar si localStorage ya tiene estructura válida
const serviciosGuardados = JSON.parse(localStorage.getItem("servicios"));

if (!serviciosGuardados || !Array.isArray(serviciosGuardados) || !serviciosGuardados[0]?.cliente) {
    localStorage.setItem("servicios", JSON.stringify(serviciosIniciales));
}

// ===============================
// GUARDAR SERVICIO
// ===============================
const btnGuardar = document.getElementById("btnGuardar");

if (btnGuardar) {
    btnGuardar.addEventListener("click", function () {
        const idEditar = document.getElementById("idEditar").value;
        const cliente = document.getElementById("cliente").value.trim();
        const dispositivo = document.getElementById("dispositivo").value.trim();
        const servicio = document.getElementById("servicio").value.trim();
        const fecha = document.getElementById("fecha").value;
        const estado = document.getElementById("estadoServicio").value;

        if (!cliente || !dispositivo || !servicio || !fecha) {
            alert("Complete todos los campos");
            return;
        }

        let servicios = JSON.parse(localStorage.getItem("servicios")) || [];

        if (idEditar) {
            servicios = servicios.map(s => {
                if (s.id == idEditar) {
                    return {
                        ...s,
                        cliente,
                        dispositivo,
                        servicio,
                        fecha,
                        estado
                    };
                }
                return s;
            });
        } else {
            servicios.push({
                id: Date.now(),
                cliente,
                dispositivo,
                servicio,
                fecha,
                estado: "Pendiente"
            });
        }

        localStorage.setItem("servicios", JSON.stringify(servicios));

        limpiarFormulario();
        cargarServicios();
        actualizarCards();
    });
}


// ===============================
// CARGAR SERVICIOS EN TABLA
// ===============================
function cargarServicios() {
    const tabla = document.querySelector("#tablaServicios tbody");
    if (!tabla) return;

    tabla.innerHTML = "";

    const servicios = JSON.parse(localStorage.getItem("servicios")) || [];

    servicios.slice().reverse().forEach(s => {
        const claseEstado = s.estado === "Completado" ? "completado" : "pendiente";

        const fila = `
            <tr>
                <td>${s.fecha}</td>
                <td>${s.id}</td>
                <td>${s.cliente}</td>
                <td>${s.dispositivo}</td>
                <td>${s.servicio}</td>
                <td>
                    <span class="estado ${claseEstado}">${s.estado}</span>
                    <br>
                    <button class="btn-editar-historial" onclick="editarServicio(${s.id})">
                        Editar
                    </button>
                </td>
            </tr>
        `;

        tabla.innerHTML += fila;
    });
}

// ===============================
// ACTUALIZAR CARDS
// ===============================
function actualizarCards() {
    const servicios = JSON.parse(localStorage.getItem("servicios")) || [];

    const total = document.getElementById("totalServicios");
    const pendientesEl = document.getElementById("serviciosPendientes");
    const procesoEl = document.getElementById("serviciosProceso");
    const completadosEl = document.getElementById("serviciosCompletados");

    const pendientes = servicios.filter(s => s.estado === "Pendiente");
    const proceso = servicios.filter(s => s.estado === "En Proceso");
    const completados = servicios.filter(s => s.estado === "Completado");

    if (total) total.textContent = servicios.length;
    if (pendientesEl) pendientesEl.textContent = pendientes.length;
    if (procesoEl) procesoEl.textContent = proceso.length;
    if (completadosEl) completadosEl.textContent = completados.length;
}

// ===============================
// LIMPIAR FORMULARIO
// ===============================
function limpiarFormulario() {
    document.getElementById("idEditar").value = "";
    document.getElementById("cliente").value = "";
    document.getElementById("dispositivo").value = "";
    document.getElementById("servicio").value = "";
    document.getElementById("fecha").value = "";
    document.getElementById("estadoServicio").value = "Pendiente";

    document.getElementById("tituloFormulario").textContent = "Solicitud de Servicio";
    document.getElementById("btnGuardar").textContent = "Guardar Servicio";
}

function cambiarEstado(id) {
    let servicios = JSON.parse(localStorage.getItem("servicios")) || [];

    servicios = servicios.map(s => {
        if (s.id === id) {
            if (s.estado === "Pendiente") {
                s.estado = "Completado";
            } else {
                s.estado = "Pendiente";
            }
        }
        return s;
    });

    localStorage.setItem("servicios", JSON.stringify(servicios));
    cargarServicios();
    actualizarCards();
}
function editarServicio(id) {
    const servicios = JSON.parse(localStorage.getItem("servicios")) || [];
    const servicioEncontrado = servicios.find(s => s.id === id);

    if (!servicioEncontrado) return;

    document.getElementById("idEditar").value = servicioEncontrado.id;
    document.getElementById("cliente").value = servicioEncontrado.cliente;
    document.getElementById("dispositivo").value = servicioEncontrado.dispositivo;
    document.getElementById("servicio").value = servicioEncontrado.servicio;
    document.getElementById("fecha").value = servicioEncontrado.fecha;
    document.getElementById("estadoServicio").value = servicioEncontrado.estado;

    document.getElementById("tituloFormulario").textContent = "Editar Servicio";
    document.getElementById("btnGuardar").textContent = "Actualizar Servicio";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
    cargarServicios();
actualizarCards();
}

// ===============================
// INICIALIZAR
// ===============================
cargarServicios();
actualizarCards();