const tablaTecnicos   = document.querySelector("#tablaTecnicos tbody");
const totalTecnicos   = document.getElementById("totalTecnicos");
const tecnicosActivos = document.getElementById("tecnicosActivos");
const tecnicosInactivos = document.getElementById("tecnicosInactivos");
const btnGuardarTecnico = document.getElementById("btnGuardarTecnico");

// Datos iniciales - coinciden con las filas del HTML
const tecnicos = [
    { nombre: "Carlos Ruiz", especialidad: "Hardware", telefono: "8888-1234", estado: "Activo" }
];

let indiceEditando = -1;

function telefonoValido(telefono) {
    const soloDigitos = telefono.replace(/\D/g, "");
    return soloDigitos.length >= 8;
}

function actualizarResumen() {
    let activos = 0, inactivos = 0;
    tecnicos.forEach(t => {
        if (t.estado === "Activo") activos++;
        else inactivos++;
    });

    if (totalTecnicos)     totalTecnicos.textContent     = tecnicos.length;
    if (tecnicosActivos)   tecnicosActivos.textContent   = activos;
    if (tecnicosInactivos) tecnicosInactivos.textContent = inactivos;
}

function renderizarTabla(lista) {
    tablaTecnicos.innerHTML = "";

    lista.forEach((tecnico) => {
        const indexReal   = tecnicos.indexOf(tecnico);
        const claseEstado = tecnico.estado === "Activo" ? "activo" : "inactivo";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${indexReal + 1}</td>
            <td>${tecnico.nombre}</td>
            <td>${tecnico.especialidad}</td>
            <td>${tecnico.telefono}</td>
            <td><span class="estado ${claseEstado}">${tecnico.estado}</span></td>
            <td>
                <button class="btn-editar"><i class="fa fa-pen"></i> Editar</button>
                <button class="btn-eliminar"><i class="fa fa-trash"></i> Eliminar</button>
            </td>
        `;

        tr.querySelector(".btn-editar").addEventListener("click", () => {
            cargarTecnicoEnFormulario(indexReal);
        });

        tr.querySelector(".btn-eliminar").addEventListener("click", async () => {
            const confirmado = await confirmarAccion({
                titulo: "Eliminar técnico",
                mensaje: `¿Seguro que querés eliminar a ${tecnico.nombre}? Esta acción no se puede deshacer.`
            });

            if (!confirmado) return;

            tecnicos.splice(indexReal, 1);
            if (indiceEditando === indexReal) {
                limpiarFormulario();
            } else if (indiceEditando > indexReal) {
                indiceEditando--;
            }
            renderizarTabla(tecnicos);
            actualizarResumen();
            mostrarNotificacion("Técnico eliminado correctamente.", "success");
        });

        tablaTecnicos.appendChild(tr);
    });
}

function cargarTecnicoEnFormulario(index) {
    const t = tecnicos[index];
    indiceEditando = index;

    document.getElementById("nombreTecnico").value       = t.nombre;
    document.getElementById("especialidadTecnico").value = t.especialidad;
    document.getElementById("telefonoTecnico").value     = t.telefono;
    document.getElementById("estadoTecnico").value       = t.estado;

    btnGuardarTecnico.textContent       = "Guardar cambios";
    btnGuardarTecnico.style.background  = "rgba(34, 211, 238, 0.15)";
    btnGuardarTecnico.style.color       = "#22d3ee";
    btnGuardarTecnico.style.borderColor = "rgba(34, 211, 238, 0.35)";

    document.querySelector(".form-container").scrollIntoView({ behavior: "smooth" });
}

function limpiarFormulario() {
    document.getElementById("nombreTecnico").value       = "";
    document.getElementById("especialidadTecnico").value = "";
    document.getElementById("telefonoTecnico").value     = "";
    document.getElementById("estadoTecnico").value       = "Activo";

    indiceEditando = -1;
    btnGuardarTecnico.textContent       = "Guardar Técnico";
    btnGuardarTecnico.style.background  = "";
    btnGuardarTecnico.style.color       = "";
    btnGuardarTecnico.style.borderColor = "";
}

btnGuardarTecnico.addEventListener("click", () => {
    const nombre       = document.getElementById("nombreTecnico").value.trim();
    const especialidad = document.getElementById("especialidadTecnico").value.trim();
    const telefono     = document.getElementById("telefonoTecnico").value.trim();
    const estado       = document.getElementById("estadoTecnico").value;

    if (!nombre || !especialidad || !telefono) {
        mostrarNotificacion("Completa todos los campos.");
        return;
    }

    if (nombre.length < 3) {
        mostrarNotificacion("El nombre del técnico debe tener al menos 3 caracteres.");
        return;
    }

    if (especialidad.length < 3) {
        mostrarNotificacion("La especialidad debe tener al menos 3 caracteres.");
        return;
    }

    if (!telefonoValido(telefono)) {
        mostrarNotificacion("Ingresa un teléfono válido de al menos 8 dígitos.");
        return;
    }

    if (indiceEditando >= 0) {
        tecnicos[indiceEditando] = { nombre, especialidad, telefono, estado };
    } else {
        tecnicos.push({ nombre, especialidad, telefono, estado });
    }

    renderizarTabla(tecnicos);
    actualizarResumen();
    limpiarFormulario();
    mostrarNotificacion("Técnico guardado correctamente.", "success");
});

document.getElementById("buscarTecnico").addEventListener("keyup", (e) => {
    const filtro = e.target.value.toLowerCase();
    const filtrados = tecnicos.filter(t =>
        t.nombre.toLowerCase().includes(filtro) ||
        t.especialidad.toLowerCase().includes(filtro) ||
        t.telefono.toLowerCase().includes(filtro)
    );
    renderizarTabla(filtrados);
});

// Arrancar
renderizarTabla(tecnicos);
actualizarResumen();


