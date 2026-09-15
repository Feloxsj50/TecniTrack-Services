(function inicializarActividadReciente(global) {
    "use strict";

    const EVENTOS = Object.freeze({
        creacion: { icono: "fa-file-circle-plus", clase: "orden" },
        asignacion: { icono: "fa-user-check", clase: "orden" },
        inicio: { icono: "fa-play", clase: "orden" },
        cambio_estado: { icono: "fa-arrow-right-arrow-left", clase: "orden" },
        diagnostico: { icono: "fa-stethoscope", clase: "orden" },
        finalizacion: { icono: "fa-circle-check", clase: "completada" },
        cancelacion: { icono: "fa-ban", clase: "cancelada" },
        orden_eliminada: { icono: "fa-trash", clase: "cancelada" },
        garantia_activada: { icono: "fa-shield-halved", clase: "garantia" },
        garantia_anulada: { icono: "fa-shield", clase: "cancelada" },
        reingreso_garantia: { icono: "fa-rotate-left", clase: "garantia" },
        factura_guardada: { icono: "fa-file-invoice-dollar", clase: "facturacion" },
        factura_eliminada: { icono: "fa-file-circle-xmark", clase: "cancelada" },
        inventario_registro: { icono: "fa-box-open", clase: "inventario" },
        inventario_ajuste: { icono: "fa-boxes-stacked", clase: "inventario" },
        inventario_salida: { icono: "fa-arrow-up-from-bracket", clase: "inventario" },
        inventario_restauracion: { icono: "fa-arrow-rotate-left", clase: "inventario" },
        ticket_creado: { icono: "fa-headset", clase: "soporte" },
        ticket_respondido: { icono: "fa-comment-dots", clase: "soporte" }
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

    function fechaValida(valor) {
        const fecha = new Date(valor);
        return Number.isNaN(fecha.getTime()) ? null : fecha;
    }

    function fechaAbsoluta(valor) {
        const fecha = fechaValida(valor);
        return fecha ? FORMATO_FECHA.format(fecha) : "Fecha no disponible";
    }

    function tiempoRelativo(valor, ahora = Date.now()) {
        const fecha = fechaValida(valor);
        if (!fecha) return "Tiempo no disponible";

        const diferencia = ahora - fecha.getTime();
        const futuro = diferencia < 0;
        const segundos = Math.abs(diferencia) / 1000;
        let cantidad;
        let unidad;

        if (segundos < 60) return futuro ? "En menos de 1 min" : "Ahora";
        if (segundos < 3600) {
            cantidad = Math.floor(segundos / 60);
            unidad = "min";
        } else if (segundos < 86400) {
            cantidad = Math.floor(segundos / 3600);
            unidad = "h";
        } else {
            cantidad = Math.floor(segundos / 86400);
            unidad = cantidad === 1 ? "día" : "días";
        }
        return futuro ? `En ${cantidad} ${unidad}` : `Hace ${cantidad} ${unidad}`;
    }

    function etiquetaRol(rol) {
        return ROLES[rol] || rol || "";
    }

    function configuracionEvento(evento) {
        return EVENTOS[evento] || { icono: "fa-clock-rotate-left", clase: "neutral" };
    }

    function create({ container, apiBase, limite = 10, onActivate = null }) {
        if (!container) throw new Error("ActividadReciente necesita un contenedor válido.");

        let controlador = null;
        let numeroSolicitud = 0;
        let actividadesActuales = [];

        container.classList.add("recent-activity-panel");
        const encabezado = crearElemento("div", "recent-activity-heading");
        const tituloGrupo = crearElemento("div", "recent-activity-title");
        const titulo = crearElemento("h2", "", "Actividad reciente");
        titulo.id = "actividadRecienteTitulo";
        const contador = crearElemento("span", "recent-activity-count", "0 eventos");
        tituloGrupo.append(titulo, contador);
        encabezado.appendChild(tituloGrupo);

        const botonActualizar = crearElemento("button", "recent-activity-refresh");
        botonActualizar.type = "button";
        botonActualizar.title = "Actualizar actividad";
        botonActualizar.setAttribute("aria-label", "Actualizar actividad reciente");
        botonActualizar.appendChild(crearIcono("fa-rotate-right"));
        encabezado.appendChild(botonActualizar);

        const contenido = crearElemento("div", "recent-activity-content");
        contenido.setAttribute("aria-live", "polite");
        contenido.setAttribute("aria-busy", "false");
        container.setAttribute("aria-labelledby", titulo.id);
        container.replaceChildren(encabezado, contenido);

        function cambiarCarga(cargando) {
            contenido.setAttribute("aria-busy", String(cargando));
            botonActualizar.disabled = cargando;
            botonActualizar.classList.toggle("is-loading", cargando);
        }

        function actualizarContador(total) {
            contador.textContent = `${total} ${total === 1 ? "evento" : "eventos"}`;
        }

        function actualizarTiemposRelativos() {
            const ahora = Date.now();
            contenido.querySelectorAll("[data-activity-time]").forEach(elemento => {
                elemento.textContent = tiempoRelativo(elemento.dataset.activityTime, ahora);
            });
        }

        function crearBotonReintento() {
            const boton = crearElemento("button", "recent-activity-retry", "Reintentar");
            boton.type = "button";
            boton.prepend(crearIcono("fa-rotate-right"));
            boton.addEventListener("click", () => load());
            return boton;
        }

        function renderizarCarga() {
            const estado = crearElemento("div", "recent-activity-state is-loading");
            estado.setAttribute("role", "status");
            estado.appendChild(crearIcono("fa-spinner", "fa-spin"));
            estado.appendChild(crearElemento("span", "", "Cargando actividad..."));
            contenido.replaceChildren(estado);
        }

        function renderizarVacio() {
            const estado = crearElemento("div", "recent-activity-state");
            estado.appendChild(crearIcono("fa-clock-rotate-left"));
            estado.appendChild(crearElemento("strong", "", "Sin actividad reciente"));
            estado.appendChild(crearElemento("span", "", "Las acciones del taller aparecerán aquí."));
            contenido.replaceChildren(estado);
            actualizarContador(0);
        }

        function renderizarError(mensaje, conservarContenido) {
            const estado = crearElemento(
                "div",
                conservarContenido ? "recent-activity-inline-error" : "recent-activity-state is-error"
            );
            estado.setAttribute("role", "alert");
            estado.appendChild(crearIcono("fa-triangle-exclamation"));
            if (!conservarContenido) {
                estado.appendChild(crearElemento("strong", "", "No se pudo cargar la actividad"));
            }
            estado.appendChild(crearElemento("span", "", mensaje));
            estado.appendChild(crearBotonReintento());

            if (conservarContenido) {
                contenido.querySelector(".recent-activity-inline-error")?.remove();
                contenido.prepend(estado);
            } else {
                contenido.replaceChildren(estado);
                actualizarContador(0);
            }
        }

        function esAccionable(actividad) {
            const referencia = actividad.referencia;
            if (!referencia || typeof onActivate !== "function") return false;
            return referencia.tipo !== "orden" || Number.isInteger(Number(referencia.id));
        }

        function crearActividad(actividad) {
            const accionable = esAccionable(actividad);
            const item = crearElemento(accionable ? "button" : "article", "recent-activity-item");
            if (accionable) {
                item.type = "button";
                item.classList.add("is-actionable");
                item.addEventListener("click", () => onActivate(actividad, item));
            }

            const configuracion = configuracionEvento(actividad.evento);
            const icono = crearElemento("span", `recent-activity-icon is-${configuracion.clase}`);
            icono.appendChild(crearIcono(configuracion.icono));
            item.appendChild(icono);

            const cuerpo = crearElemento("span", "recent-activity-body");
            cuerpo.appendChild(crearElemento("strong", "recent-activity-item-title", actividad.titulo || "Actividad registrada"));
            if (actividad.descripcion) {
                cuerpo.appendChild(crearElemento("span", "recent-activity-description", actividad.descripcion));
            }

            const metadatos = crearElemento("span", "recent-activity-meta");
            const actor = crearElemento("span", "recent-activity-actor");
            actor.appendChild(crearIcono("fa-user"));
            const rol = etiquetaRol(actividad.actor?.rol);
            const nombre = actividad.actor?.nombre || "Sistema";
            actor.appendChild(document.createTextNode(rol && rol !== nombre ? `${nombre} · ${rol}` : nombre));
            metadatos.appendChild(actor);

            const fechas = crearElemento("span", "recent-activity-time-group");
            const relativo = crearElemento("span", "recent-activity-relative", tiempoRelativo(actividad.creadoEn));
            relativo.dataset.activityTime = actividad.creadoEn || "";
            fechas.appendChild(relativo);
            const absoluto = crearElemento("time", "recent-activity-absolute", fechaAbsoluta(actividad.creadoEn));
            absoluto.dateTime = actividad.creadoEn || "";
            absoluto.title = fechaAbsoluta(actividad.creadoEn);
            fechas.appendChild(absoluto);
            metadatos.appendChild(fechas);
            cuerpo.appendChild(metadatos);
            item.appendChild(cuerpo);

            if (accionable) {
                item.appendChild(crearIcono("fa-chevron-right", "recent-activity-chevron"));
            }
            return item;
        }

        function renderizarActividades(actividades, posicionScroll = 0) {
            actividadesActuales = actividades;
            if (!actividades.length) {
                renderizarVacio();
                return;
            }

            const lista = crearElemento("div", "recent-activity-list");
            actividades.forEach(actividad => lista.appendChild(crearActividad(actividad)));
            contenido.replaceChildren(lista);
            lista.scrollTop = posicionScroll;
            actualizarContador(actividades.length);
        }

        async function load(opciones = {}) {
            const silencioso = Boolean(opciones.silencioso);
            const listaActual = contenido.querySelector(".recent-activity-list");
            const conservarContenido = silencioso && Boolean(listaActual);
            const posicionScroll = listaActual ? listaActual.scrollTop : 0;

            controlador?.abort();
            controlador = new AbortController();
            const solicitud = ++numeroSolicitud;
            if (!conservarContenido) renderizarCarga();
            contenido.querySelector(".recent-activity-inline-error")?.remove();
            cambiarCarga(true);

            try {
                const respuesta = await fetch(
                    `${normalizarApiBase(apiBase)}/dashboard/actividad-reciente/?limite=${Math.max(1, Math.min(Number(limite) || 10, 20))}`,
                    { credentials: "include", signal: controlador.signal }
                );
                const datos = await leerJson(respuesta);
                if (!respuesta.ok || !datos.ok) {
                    throw new Error(datos.error || "No se pudo consultar la actividad reciente.");
                }
                if (solicitud !== numeroSolicitud) return null;

                const actividades = Array.isArray(datos.actividades) ? datos.actividades : [];
                renderizarActividades(actividades, posicionScroll);
                return datos;
            } catch (error) {
                if (error.name === "AbortError" || solicitud !== numeroSolicitud) return null;
                renderizarError(
                    error.message || "No se pudo consultar la actividad reciente.",
                    conservarContenido
                );
                return null;
            } finally {
                if (solicitud === numeroSolicitud) cambiarCarga(false);
            }
        }

        function refresh() {
            return load({ silencioso: actividadesActuales.length > 0 });
        }

        botonActualizar.addEventListener("click", refresh);
        global.setInterval(actualizarTiemposRelativos, 60000);

        return Object.freeze({ load, refresh, actualizarTiemposRelativos });
    }

    global.RecentActivity = Object.freeze({ create });
})(window);
