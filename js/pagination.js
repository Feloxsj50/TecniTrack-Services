(function () {
    window.renderizarPaginacion = function (id, total, pagina, alCambiar, porPagina = 5) {
        const contenedor = document.getElementById(id);
        if (!contenedor) return;
        const paginas = Math.max(1, Math.ceil(total / porPagina));
        contenedor.innerHTML = "";
        if (total <= porPagina) return;

        const crearBoton = (texto, destino, deshabilitado = false) => {
            const boton = document.createElement("button");
            boton.type = "button";
            boton.textContent = texto;
            boton.disabled = deshabilitado;
            boton.className = destino === pagina ? "active" : "";
            boton.addEventListener("click", () => alCambiar(destino));
            contenedor.appendChild(boton);
        };

        crearBoton("Anterior", pagina - 1, pagina === 1);
        for (let numero = 1; numero <= paginas; numero += 1) crearBoton(String(numero), numero, false);
        crearBoton("Siguiente", pagina + 1, pagina === paginas);
    };

    window.obtenerPagina = function (lista, pagina, porPagina = 5) {
        const inicio = (pagina - 1) * porPagina;
        return lista.slice(inicio, inicio + porPagina);
    };
})();
