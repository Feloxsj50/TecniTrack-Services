(function inicializarOrderTimeline(global) {
    "use strict";

    const EVENTOS = Object.freeze({
        creacion: {
            titulo: "Orden creada",
            icono: "fa-file-circle-plus",
            clase: "creacion"
        },
        asignacion: {
            titulo: "Técnico asignado",
            icono: "fa-user-check",
            clase: "asignacion"
        },
        inicio: {
            titulo: "Servicio iniciado",
            icono: "fa-play",
            clase: "inicio"
        },
        cambio_estado: {
            titulo: "Cambio de estado",
            icono: "fa-arrow-right-arrow-left",
            clase: "cambio-estado"
        },
        diagnostico: {
            titulo: "Diagnóstico registrado",
            icono: "fa-stethoscope",
            clase: "diagnostico"
        },
        finalizacion: {
            titulo: "Servicio finalizado",
            icono: "fa-circle-check",
            clase: "finalizacion"
        },
        cancelacion: {
            titulo: "Orden cancelada",
            icono: "fa-ban",
            clase: "cancelacion"
        }
    });

    const ROLES = Object.freeze({
        admin: "Administrador",
        tecnico: "Técnico",
        cliente: "Cliente",
        sistema: "Sistema"
    });

    const FORMATO_FECHA = new Intl.DateTimeFormat("es-NI", {
        dateStyle: "medium",
        timeStyle: "short"
    });

    function crearElemento(etiqueta, clase = "", texto = "") {
        const elemento = document.createElement(etiqueta);
        if (clase) elemento.className = clase;
        if (texto) elemento.textContent = texto;
        return elemento;
    }

    function crearIcono(nombre, clase = "") {
        const icono = crearElemento("i", `fa-solid ${nombre}${clase ? ` ${clase}` : ""}`);
        icono.setAttribute("aria-hidden", "true");
        return icono;
    }

    function normalizarApiBase(apiBase) {
        return String(apiBase || "").replace(/\/$/, "");
    }

    async function leerJson(respuesta) {
        const texto = await respuesta.text();
        try {
            return JSON.parse(texto);
        } catch {
            return { ok: false, error: "Django devolvió una respuesta no válida." };
        }
    }

    function nombreRol(rol) {
        return ROLES[rol] || rol || "Sistema";
    }

    function fechaVisible(valor) {
        const fecha = new Date(valor);
        return Number.isNaN(fecha.getTime()) ? "Fecha no disponible" : FORMATO_FECHA.format(fecha);
    }

    function claseEstado(valor) {
        const permitidos = ["pendiente", "en_proceso", "completado", "cancelado"];
        return permitidos.includes(valor) ? valor.replace("_", "-") : "neutral";
    }

    function crearValorCambio(texto, estado = "") {
        return crearElemento(
            "span",
            `order-timeline-value ${estado ? `is-${claseEstado(estado)}` : ""}`.trim(),
            texto || "Sin asignar"
        );
    }

    function crearCambio(etiqueta, anterior, nuevo, estadoAnterior = "", estadoNuevo = "") {
        const cambio = crearElemento("div", "order-timeline-change");
        cambio.appendChild(crearElemento("span", "order-timeline-change-label", etiqueta));

        const valores = crearElemento("div", "order-timeline-change-values");
        if (anterior) {
            valores.appendChild(crearValorCambio(anterior, estadoAnterior));
            valores.appendChild(crearIcono("fa-arrow-right", "order-timeline-change-arrow"));
        }
        valores.appendChild(crearValorCambio(nuevo, estadoNuevo));
        cambio.appendChild(valores);
        return cambio;
    }

    function crearCambiosEvento(evento) {
        const cambios = crearElemento("div", "order-timeline-changes");
        const tecnicoAnterior = evento.tecnicoAnterior?.nombre || "";
        const tecnicoNuevo = evento.tecnicoNuevo?.nombre || "";

        if (evento.accion === "asignacion" && (tecnicoAnterior || tecnicoNuevo)) {
            cambios.appendChild(crearCambio(
                "Técnico",
                tecnicoAnterior || "Sin asignar",
                tecnicoNuevo || "Sin asignar"
            ));
        }

        const estadoAnterior = evento.estadoAnteriorNombre || evento.estadoAnterior || "";
        const estadoNuevo = evento.estadoNuevoNombre || evento.estadoNuevo || "";
        if (estadoAnterior || estadoNuevo) {
            cambios.appendChild(crearCambio(
                "Estado",
                estadoAnterior,
                estadoNuevo || estadoAnterior,
                evento.estadoAnterior,
                evento.estadoNuevo || evento.estadoAnterior
            ));
        }

        return cambios.childElementCount ? cambios : null;
    }

    function crearEvento(evento) {
        const configuracion = EVENTOS[evento.accion] || {
            titulo: evento.accionNombre || "Actividad de la orden",
            icono: "fa-clock-rotate-left",
            clase: "otro"
        };
        const item = crearElemento(
            "li",
            `order-timeline-event is-${configuracion.clase}${evento.visibilidad === "interno" ? " is-interno" : ""}`
        );

        const marcador = crearElemento("div", "order-timeline-marker");
        marcador.appendChild(crearIcono(configuracion.icono));
        item.appendChild(marcador);

        const contenido = crearElemento("article", "order-timeline-event-content");
        const encabezado = crearElemento("div", "order-timeline-event-heading");
        encabezado.appendChild(crearElemento("h4", "", configuracion.titulo));
        if (evento.visibilidad === "interno") {
            encabezado.appendChild(crearElemento("span", "order-timeline-visibility", "Interno"));
        }
        contenido.appendChild(encabezado);

        if (evento.descripcion) {
            contenido.appendChild(crearElemento("p", "order-timeline-description", evento.descripcion));
        }

        const cambios = crearCambiosEvento(evento);
        if (cambios) contenido.appendChild(cambios);

        const pie = crearElemento("div", "order-timeline-meta");
        const actor = crearElemento("span");
        actor.appendChild(crearIcono("fa-user"));
        const nombreActor = evento.usuario?.nombre || "Sistema";
        actor.appendChild(document.createTextNode(`${nombreActor} · ${nombreRol(evento.usuario?.rol)}`));
        pie.appendChild(actor);

        const fecha = crearElemento("time");
        fecha.dateTime = evento.fecha || "";
        fecha.appendChild(crearIcono("fa-clock"));
        fecha.appendChild(document.createTextNode(fechaVisible(evento.fecha)));
        pie.appendChild(fecha);
        contenido.appendChild(pie);

        item.appendChild(contenido);
        return item;
    }

    function create({ container, apiBase }) {
        if (!container) throw new Error("OrderTimeline necesita un contenedor válido.");

        let ordenId = null;
        let controlador = null;
        let solicitudActual = 0;

        const seccion = crearElemento("section", "order-timeline-section");
        const encabezado = crearElemento("div", "order-timeline-heading");
        const titulos = crearElemento("div");
        titulos.appendChild(crearElemento("span", "order-timeline-eyebrow", "Seguimiento"));
        titulos.appendChild(crearElemento("h3", "", "Historial de la orden"));
        encabezado.appendChild(titulos);

        const botonActualizar = crearElemento("button", "order-timeline-refresh");
        botonActualizar.type = "button";
        botonActualizar.title = "Actualizar historial";
        botonActualizar.setAttribute("aria-label", "Actualizar historial");
        botonActualizar.appendChild(crearIcono("fa-rotate-right"));
        botonActualizar.disabled = true;
        encabezado.appendChild(botonActualizar);
        seccion.appendChild(encabezado);

        const contenido = crearElemento("div", "order-timeline-content");
        contenido.setAttribute("aria-live", "polite");
        contenido.setAttribute("aria-busy", "false");
        seccion.appendChild(contenido);
        container.replaceChildren(seccion);

        function cambiarCarga(cargando) {
            contenido.setAttribute("aria-busy", String(cargando));
            botonActualizar.disabled = cargando || !ordenId;
            botonActualizar.classList.toggle("is-loading", cargando);
        }

        function crearBotonReintento() {
            const boton = crearElemento("button", "order-timeline-retry", "Reintentar");
            boton.type = "button";
            boton.prepend(crearIcono("fa-rotate-right"));
            boton.addEventListener("click", () => load(ordenId));
            return boton;
        }

        function renderizarCarga() {
            const estado = crearElemento("div", "order-timeline-state is-loading");
            estado.setAttribute("role", "status");
            estado.appendChild(crearIcono("fa-spinner", "fa-spin"));
            estado.appendChild(crearElemento("span", "", "Cargando historial..."));
            contenido.replaceChildren(estado);
        }

        function renderizarVacio() {
            const estado = crearElemento("div", "order-timeline-state");
            estado.appendChild(crearIcono("fa-clock-rotate-left"));
            estado.appendChild(crearElemento("strong", "", "Sin actividad registrada"));
            estado.appendChild(crearElemento("span", "", "Esta orden todavía no tiene eventos en su historial."));
            contenido.replaceChildren(estado);
        }

        function renderizarError(mensaje, conservarContenido) {
            const estado = crearElemento(
                "div",
                conservarContenido ? "order-timeline-inline-error" : "order-timeline-state is-error"
            );
            estado.setAttribute("role", "alert");
            estado.appendChild(crearIcono("fa-triangle-exclamation"));
            if (!conservarContenido) {
                estado.appendChild(crearElemento("strong", "", "No se pudo cargar el historial"));
            }
            estado.appendChild(crearElemento("span", "", mensaje));
            estado.appendChild(crearBotonReintento());

            if (conservarContenido) {
                contenido.querySelector(".order-timeline-inline-error")?.remove();
                contenido.prepend(estado);
            } else {
                contenido.replaceChildren(estado);
            }
        }

        function renderizarEventos(eventos, posicionScroll = 0) {
            if (!eventos.length) {
                renderizarVacio();
                return;
            }

            const lista = crearElemento("ol", "order-timeline-list");
            eventos.forEach(evento => lista.appendChild(crearEvento(evento)));
            contenido.replaceChildren(lista);
            lista.scrollTop = posicionScroll;
        }

        async function load(nuevaOrdenId, opciones = {}) {
            const id = Number(nuevaOrdenId);
            if (!Number.isInteger(id) || id <= 0) {
                ordenId = null;
                renderizarError("No se pudo identificar la orden seleccionada.", false);
                return null;
            }

            ordenId = id;
            const silencioso = Boolean(opciones.silencioso);
            const listaActual = contenido.querySelector(".order-timeline-list");
            const conservarContenido = silencioso && Boolean(listaActual);
            const posicionScroll = opciones.conservarScroll && listaActual ? listaActual.scrollTop : 0;

            controlador?.abort();
            controlador = new AbortController();
            const numeroSolicitud = ++solicitudActual;

            if (!conservarContenido) renderizarCarga();
            contenido.querySelector(".order-timeline-inline-error")?.remove();
            cambiarCarga(true);

            try {
                const respuesta = await fetch(
                    `${normalizarApiBase(apiBase)}/servicios/${id}/historial/`,
                    {
                        credentials: "include",
                        signal: controlador.signal
                    }
                );
                const datos = await leerJson(respuesta);
                if (!respuesta.ok || !datos.ok) {
                    throw new Error(datos.error || "No se pudo consultar el historial de la orden.");
                }
                if (numeroSolicitud !== solicitudActual || id !== ordenId) return null;

                const eventos = Array.isArray(datos.historial) ? datos.historial : [];
                renderizarEventos(eventos, posicionScroll);
                return datos;
            } catch (error) {
                if (error.name === "AbortError") return null;
                if (numeroSolicitud !== solicitudActual || id !== ordenId) return null;
                renderizarError(
                    error.message || "No se pudo consultar el historial de la orden.",
                    conservarContenido
                );
                return null;
            } finally {
                if (numeroSolicitud === solicitudActual) cambiarCarga(false);
            }
        }

        function refresh(nuevaOrdenId = ordenId) {
            return load(nuevaOrdenId, { silencioso: true, conservarScroll: true });
        }

        function clear() {
            solicitudActual += 1;
            controlador?.abort();
            controlador = null;
            ordenId = null;
            botonActualizar.disabled = true;
            contenido.replaceChildren();
            contenido.setAttribute("aria-busy", "false");
        }

        botonActualizar.addEventListener("click", () => refresh());

        return Object.freeze({
            load,
            refresh,
            clear,
            getOrderId: () => ordenId
        });
    }

    global.OrderTimeline = Object.freeze({ create });
})(window);
