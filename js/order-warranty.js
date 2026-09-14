(function inicializarOrderWarranty(global) {
    "use strict";

    const ESTADOS = Object.freeze({
        vigente: { texto: "Vigente", icono: "fa-shield-halved" },
        vencida: { texto: "Vencida", icono: "fa-clock" },
        utilizada: { texto: "Utilizada", icono: "fa-rotate-left" },
        anulada: { texto: "Anulada", icono: "fa-circle-xmark" }
    });
    const ROLES = Object.freeze({
        admin: "Administrador",
        tecnico: "Técnico",
        cliente: "Cliente",
        sistema: "Sistema"
    });
    const FORMATO_FECHA = new Intl.DateTimeFormat("es-NI", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
    const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-NI", {
        dateStyle: "medium",
        timeStyle: "short"
    });

    class ErrorGarantia extends Error {
        constructor(mensaje, estado = 0) {
            super(mensaje);
            this.name = "ErrorGarantia";
            this.estado = estado;
        }
    }

    function crearElemento(etiqueta, clase = "", texto = "") {
        const elemento = document.createElement(etiqueta);
        if (clase) elemento.className = clase;
        if (texto !== "") elemento.textContent = texto;
        return elemento;
    }

    function crearIcono(nombre) {
        const icono = crearElemento("i", `fa-solid ${nombre}`);
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

    function mensajePorEstado(estado, mensaje) {
        if (estado === 401) return "Tu sesión venció. Inicia sesión nuevamente.";
        if (estado === 403) return "No tienes permiso para consultar esta garantía.";
        if (estado === 404) return "La orden o garantía ya no está disponible.";
        return mensaje || "No se pudo consultar la garantía.";
    }

    async function solicitar(apiBase, ruta, opciones = {}) {
        const respuesta = await fetch(`${normalizarApiBase(apiBase)}${ruta}`, {
            credentials: "include",
            ...opciones
        });
        const datos = await leerJson(respuesta);
        if (!respuesta.ok || !datos.ok) {
            throw new ErrorGarantia(
                mensajePorEstado(respuesta.status, datos.error),
                respuesta.status
            );
        }
        return datos;
    }

    async function fetchByOrder(apiBase, orderId, opciones = {}) {
        const id = Number(orderId);
        if (!Number.isInteger(id) || id <= 0) {
            throw new ErrorGarantia("No se pudo identificar la orden seleccionada.");
        }
        const datos = await solicitar(
            apiBase,
            `/garantias/solicitud/${id}/`,
            { method: "GET", signal: opciones.signal }
        );
        return datos.garantia || null;
    }

    function fechaVisible(valor, incluirHora = false) {
        if (!valor) return "-";
        const fecha = new Date(
            /^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T12:00:00` : valor
        );
        if (Number.isNaN(fecha.getTime())) return "-";
        return (incluirHora ? FORMATO_FECHA_HORA : FORMATO_FECHA).format(fecha);
    }

    function configuracionEstado(estado) {
        return ESTADOS[estado] || { texto: "Sin registrar", icono: "fa-shield" };
    }

    function crearEstado(garantia) {
        const estado = garantia?.estado || "sin-registrar";
        const configuracion = configuracionEstado(garantia?.estado);
        const badge = crearElemento("span", `order-warranty-status is-${estado}`);
        badge.appendChild(crearIcono(configuracion.icono));
        badge.appendChild(document.createTextNode(garantia?.estadoNombre || configuracion.texto));
        return badge;
    }

    function textoActor(actor) {
        if (!actor) return "";
        const nombre = actor.nombre || actor.username || "Sistema";
        const rol = ROLES[actor.rol] || actor.rol || "";
        return rol ? `${nombre} · ${rol}` : nombre;
    }

    function legacySnapshot(garantia, respaldo = "Sin Garantía") {
        if (!garantia) return respaldo || "Sin Garantía";
        const dias = Number(garantia.duracionDias);
        return Number.isFinite(dias)
            ? `${dias} ${dias === 1 ? "Día" : "Días"}`
            : respaldo || "Garantía registrada";
    }

    function documentLabel(garantia, respaldo = "-") {
        if (!garantia) return respaldo || "-";
        if (garantia.estado === "vigente") {
            return `${legacySnapshot(garantia)} · vigente hasta ${fechaVisible(garantia.fechaVencimiento)}`;
        }
        if (garantia.estado === "vencida") {
            return `Vencida el ${fechaVisible(garantia.fechaVencimiento)}`;
        }
        if (garantia.estado === "utilizada") {
            const codigo = garantia.reingreso?.orden?.codigo;
            return codigo ? `Utilizada · reingreso ${codigo}` : "Garantía utilizada";
        }
        if (garantia.estado === "anulada") return "Garantía anulada";
        return garantia.estadoNombre || respaldo || "-";
    }

    function renderCompact(container, garantia, opciones = {}) {
        if (!container) return;
        const resumen = crearElemento("div", "invoice-warranty-summary");
        const titulo = crearElemento("div", "invoice-warranty-copy");
        titulo.appendChild(crearElemento("span", "", opciones.titulo || "Garantía de la orden"));
        titulo.appendChild(crearElemento(
            "strong",
            "",
            documentLabel(garantia, opciones.legacy || "Sin Garantía registrada")
        ));
        resumen.appendChild(titulo);
        resumen.appendChild(crearEstado(garantia));
        container.replaceChildren(resumen);
    }

    function createReentryBadge(solicitud, texto = "Garantía") {
        if (!solicitud?.esReingresoGarantia) return null;
        const codigo = solicitud.ordenOriginalGarantia?.codigo;
        const badge = crearElemento("span", "order-reentry-badge");
        badge.title = codigo
            ? `Reingreso relacionado con ${codigo}`
            : "Reingreso por garantía";
        badge.append(crearIcono("fa-shield-halved"), document.createTextNode(texto));
        return badge;
    }

    function create({ container, apiBase, actions = null, onChanged = null }) {
        if (!container) throw new Error("OrderWarranty necesita un contenedor válido.");

        let ordenId = null;
        let contexto = {};
        let garantiaActual = null;
        let controlador = null;
        let numeroSolicitud = 0;
        let procesando = false;

        const seccion = crearElemento("section", "order-warranty-section");
        const encabezado = crearElemento("div", "order-warranty-heading");
        const titulos = crearElemento("div");
        titulos.appendChild(crearElemento("span", "order-warranty-eyebrow", "Cobertura"));
        titulos.appendChild(crearElemento("h3", "", "Garantía"));
        encabezado.appendChild(titulos);

        const herramientas = crearElemento("div", "order-warranty-tools");
        const estadoContenedor = crearElemento("div");
        const botonActualizar = crearElemento("button", "order-warranty-refresh");
        botonActualizar.type = "button";
        botonActualizar.title = "Actualizar garantía";
        botonActualizar.setAttribute("aria-label", "Actualizar garantía");
        botonActualizar.appendChild(crearIcono("fa-rotate-right"));
        botonActualizar.disabled = true;
        herramientas.append(estadoContenedor, botonActualizar);
        encabezado.appendChild(herramientas);
        seccion.appendChild(encabezado);

        const contenido = crearElemento("div", "order-warranty-content");
        contenido.setAttribute("aria-live", "polite");
        contenido.setAttribute("aria-busy", "false");
        seccion.appendChild(contenido);
        container.replaceChildren(seccion);

        function notificar(mensaje, tipo = "error") {
            if (typeof actions?.notify === "function") actions.notify(mensaje, tipo);
        }

        function actualizarEstadoCabecera(garantia) {
            estadoContenedor.replaceChildren(crearEstado(garantia));
            seccion.dataset.estado = garantia?.estado || "sin-registrar";
        }

        function cambiarCarga(cargando) {
            contenido.setAttribute("aria-busy", String(cargando));
            botonActualizar.disabled = cargando || procesando || !ordenId;
            botonActualizar.classList.toggle("is-loading", cargando);
        }

        function renderizarCarga() {
            actualizarEstadoCabecera(null);
            const estado = crearElemento("div", "order-warranty-state is-loading");
            estado.setAttribute("role", "status");
            const icono = crearIcono("fa-spinner");
            icono.classList.add("fa-spin");
            estado.append(icono, crearElemento("span", "", "Cargando garantía..."));
            contenido.replaceChildren(estado);
        }

        function puedeReintentar(error) {
            return ![401, 403, 404].includes(error?.estado);
        }

        function renderizarError(error, conservarContenido) {
            const estado = crearElemento(
                "div",
                conservarContenido
                    ? "order-warranty-inline-error"
                    : "order-warranty-state is-error"
            );
            estado.setAttribute("role", "alert");
            estado.appendChild(crearIcono("fa-triangle-exclamation"));
            if (!conservarContenido) {
                estado.appendChild(crearElemento("strong", "", "No se pudo cargar la garantía"));
            }
            estado.appendChild(crearElemento("span", "", error.message));
            if (puedeReintentar(error)) {
                const reintentar = crearElemento("button", "order-warranty-retry", "Reintentar");
                reintentar.type = "button";
                reintentar.prepend(crearIcono("fa-rotate-right"));
                reintentar.addEventListener("click", () => load(ordenId, contexto));
                estado.appendChild(reintentar);
            }
            if (conservarContenido) {
                contenido.querySelector(".order-warranty-inline-error")?.remove();
                contenido.prepend(estado);
            } else {
                contenido.replaceChildren(estado);
            }
        }

        function agregarDato(lista, etiqueta, valor) {
            const item = crearElemento("div", "order-warranty-field");
            item.append(
                crearElemento("dt", "", etiqueta),
                crearElemento("dd", "", valor || "-")
            );
            lista.appendChild(item);
        }

        function agregarTexto(destino, etiqueta, valor, clase = "") {
            if (!valor) return;
            const bloque = crearElemento("div", `order-warranty-note ${clase}`.trim());
            bloque.append(
                crearElemento("span", "", etiqueta),
                crearElemento("p", "", valor)
            );
            destino.appendChild(bloque);
        }

        function crearBoton(texto, icono, clase, accion) {
            const boton = crearElemento("button", `order-warranty-button ${clase}`.trim());
            boton.type = "button";
            boton.append(crearIcono(icono), document.createTextNode(texto));
            boton.addEventListener("click", accion);
            return boton;
        }

        function crearCampo(etiqueta, control, ayuda = "") {
            const label = crearElemento("label");
            label.appendChild(crearElemento("span", "", etiqueta));
            label.appendChild(control);
            if (ayuda) label.appendChild(crearElemento("small", "", ayuda));
            return label;
        }

        function cerrarFormulario() {
            renderizarGarantia(garantiaActual);
        }

        function crearFormularioBase(titulo, descripcion) {
            const formulario = crearElemento("form", "order-warranty-form");
            const cabecera = crearElemento("div", "order-warranty-form-heading");
            const copia = crearElemento("div");
            copia.append(
                crearElemento("strong", "", titulo),
                crearElemento("span", "", descripcion)
            );
            const cerrar = crearElemento("button", "order-warranty-form-close");
            cerrar.type = "button";
            cerrar.title = "Cerrar formulario";
            cerrar.setAttribute("aria-label", "Cerrar formulario");
            cerrar.appendChild(crearIcono("fa-xmark"));
            cerrar.addEventListener("click", cerrarFormulario);
            cabecera.append(copia, cerrar);
            formulario.appendChild(cabecera);
            return formulario;
        }

        function agregarAccionesFormulario(formulario, texto, icono, clase = "") {
            const fila = crearElemento("div", "order-warranty-form-actions");
            const cancelar = crearElemento("button", "order-warranty-button is-secondary", "Cancelar");
            cancelar.type = "button";
            cancelar.addEventListener("click", cerrarFormulario);
            const guardar = crearElemento(
                "button",
                `order-warranty-button is-primary ${clase}`.trim()
            );
            guardar.type = "submit";
            guardar.append(crearIcono(icono), document.createTextNode(texto));
            fila.append(cancelar, guardar);
            formulario.appendChild(fila);
        }

        async function ejecutarAccion(ruta, payload, accion, mensajeExito) {
            if (procesando || !actions) return;
            procesando = true;
            contenido.querySelectorAll("button, input, textarea").forEach(control => {
                control.disabled = true;
            });
            botonActualizar.disabled = true;

            try {
                const token = await actions.getCsrfToken();
                const datos = await solicitar(apiBase, ruta, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": token
                    },
                    body: JSON.stringify(payload)
                });
                garantiaActual = datos.garantia || null;
                renderizarGarantia(garantiaActual);
                notificar(mensajeExito, "success");
                if (typeof onChanged === "function") {
                    try {
                        await onChanged({
                            orderId: ordenId,
                            action: accion,
                            garantia: garantiaActual
                        });
                    } catch {
                        notificar("El cambio se guardó, pero no se pudo actualizar toda la pantalla.");
                    }
                }
            } catch (error) {
                notificar(error.message || "No se pudo guardar el cambio.");
                renderizarGarantia(garantiaActual);
            } finally {
                procesando = false;
                botonActualizar.disabled = !ordenId;
            }
        }

        function mostrarFormularioActivar() {
            const formulario = crearFormularioBase(
                "Activar garantía",
                "Las fechas serán calculadas por el servidor."
            );
            const duracion = document.createElement("input");
            duracion.type = "number";
            duracion.min = "1";
            duracion.max = "32767";
            duracion.value = "30";
            duracion.required = true;
            const condiciones = document.createElement("textarea");
            condiciones.rows = 3;
            condiciones.maxLength = 5000;
            const notas = document.createElement("textarea");
            notas.rows = 3;
            notas.maxLength = 5000;
            formulario.append(
                crearCampo("Duración en días", duracion),
                crearCampo(
                    "Condiciones públicas",
                    condiciones,
                    "Este texto podrá verlo el cliente."
                ),
                crearCampo("Notas administrativas", notas)
            );
            agregarAccionesFormulario(formulario, "Activar garantía", "fa-shield-halved");
            formulario.addEventListener("submit", event => {
                event.preventDefault();
                ejecutarAccion(
                    "/garantias/crear/",
                    {
                        solicitudId: ordenId,
                        duracionDias: Number(duracion.value),
                        condicionesPublicas: condiciones.value.trim(),
                        notasInternas: notas.value.trim()
                    },
                    "activar",
                    "Garantía activada correctamente."
                );
            });
            contenido.replaceChildren(formulario);
            duracion.focus();
        }

        function mostrarFormularioReingreso() {
            const formulario = crearFormularioBase(
                "Registrar reingreso",
                "Se creará una nueva orden vinculada a la original."
            );
            const motivo = document.createElement("textarea");
            motivo.rows = 3;
            motivo.maxLength = 1000;
            motivo.required = true;
            const observaciones = document.createElement("textarea");
            observaciones.rows = 3;
            observaciones.maxLength = 5000;
            formulario.append(
                crearCampo(
                    "Motivo del reingreso",
                    motivo,
                    "Describe la falla con información que pueda ver el cliente."
                ),
                crearCampo("Observaciones administrativas", observaciones)
            );
            agregarAccionesFormulario(formulario, "Registrar reingreso", "fa-rotate-left");
            formulario.addEventListener("submit", event => {
                event.preventDefault();
                ejecutarAccion(
                    `/garantias/${garantiaActual.id}/reingreso/`,
                    {
                        motivo: motivo.value.trim(),
                        observacionesInternas: observaciones.value.trim()
                    },
                    "reingreso",
                    "Reingreso registrado correctamente."
                );
            });
            contenido.replaceChildren(formulario);
            motivo.focus();
        }

        function mostrarFormularioAnular() {
            const formulario = crearFormularioBase(
                "Anular garantía",
                "La cobertura dejará de estar disponible."
            );
            const motivo = document.createElement("textarea");
            motivo.rows = 3;
            motivo.maxLength = 1000;
            motivo.required = true;
            formulario.appendChild(crearCampo("Motivo administrativo", motivo));
            agregarAccionesFormulario(
                formulario,
                "Anular garantía",
                "fa-circle-xmark",
                "is-danger"
            );
            formulario.addEventListener("submit", async event => {
                event.preventDefault();
                const confirmado = typeof actions?.confirm === "function"
                    ? await actions.confirm({
                        titulo: "Anular garantía",
                        mensaje: "Esta garantía dejará de estar vigente.",
                        textoConfirmar: "Anular"
                    })
                    : true;
                if (!confirmado) return;
                ejecutarAccion(
                    `/garantias/${garantiaActual.id}/anular/`,
                    { motivo: motivo.value.trim() },
                    "anular",
                    "Garantía anulada correctamente."
                );
            });
            contenido.replaceChildren(formulario);
            motivo.focus();
        }

        function renderizarSinGarantia() {
            garantiaActual = null;
            actualizarEstadoCabecera(null);
            const estado = crearElemento("div", "order-warranty-state");
            estado.append(
                crearIcono(contexto.esReingresoGarantia ? "fa-shield" : "fa-wrench"),
                crearElemento(
                    "strong",
                    "",
                    contexto.esReingresoGarantia
                        ? "No se encontró la garantía relacionada"
                        : "Servicio regular"
                ),
                crearElemento("span", "", "Esta orden no tiene una garantía registrada.")
            );
            const completada = String(contexto.estado || "").toLowerCase() === "completado";
            if (actions && completada && !contexto.esReingresoGarantia) {
                estado.appendChild(crearBoton(
                    "Activar garantía",
                    "fa-shield-halved",
                    "is-primary",
                    mostrarFormularioActivar
                ));
            }
            contenido.replaceChildren(estado);
        }

        function renderizarReingreso(garantia, destino) {
            const reingreso = garantia.reingreso;
            if (!reingreso || Number(reingreso.orden?.id) !== Number(ordenId)) return;
            const banner = crearElemento("div", "order-warranty-reentry");
            const icono = crearElemento("div", "order-warranty-reentry-icon");
            icono.appendChild(crearIcono("fa-shield-halved"));
            const texto = crearElemento("div");
            texto.append(
                crearElemento("strong", "", "Reingreso por garantía"),
                crearElemento(
                    "span",
                    "",
                    `Orden original: ${garantia.ordenOriginal?.codigo || "-"}`
                )
            );
            banner.append(icono, texto);
            destino.appendChild(banner);
        }

        function renderizarGarantia(garantia) {
            if (!garantia) {
                renderizarSinGarantia();
                return;
            }

            garantiaActual = garantia;
            actualizarEstadoCabecera(garantia);
            const fragmento = document.createDocumentFragment();
            renderizarReingreso(garantia, fragmento);

            const lista = crearElemento("dl", "order-warranty-grid");
            agregarDato(lista, "Inicio", fechaVisible(garantia.fechaInicio));
            agregarDato(lista, "Vencimiento", fechaVisible(garantia.fechaVencimiento));
            agregarDato(lista, "Duración", `${garantia.duracionDias} días`);
            agregarDato(lista, "Días restantes", String(garantia.diasRestantes ?? 0));
            fragmento.appendChild(lista);

            if (garantia.estado === "vencida") {
                agregarTexto(
                    fragmento,
                    "Cobertura finalizada",
                    `Venció el ${fechaVisible(garantia.fechaVencimiento)}.`,
                    "is-status"
                );
            } else if (garantia.estado === "utilizada") {
                agregarTexto(
                    fragmento,
                    "Garantía utilizada",
                    garantia.reingreso?.orden?.codigo
                        ? `Se registró el reingreso ${garantia.reingreso.orden.codigo}.`
                        : "Ya se registró un reingreso para esta garantía.",
                    "is-status"
                );
            } else if (garantia.estado === "anulada") {
                agregarTexto(
                    fragmento,
                    "Garantía anulada",
                    garantia.anuladaEn
                        ? `Fue anulada el ${fechaVisible(garantia.anuladaEn, true)}.`
                        : "Esta cobertura fue anulada.",
                    "is-status"
                );
            }

            agregarTexto(
                fragmento,
                "Condiciones",
                garantia.condicionesPublicas || "Sin condiciones adicionales registradas."
            );
            if (garantia.reingreso?.motivo) {
                agregarTexto(fragmento, "Motivo del reingreso", garantia.reingreso.motivo);
            }

            agregarTexto(fragmento, "Notas administrativas", garantia.notasInternas, "is-internal");
            agregarTexto(
                fragmento,
                "Observaciones del reingreso",
                garantia.reingreso?.observacionesInternas,
                "is-internal"
            );
            agregarTexto(fragmento, "Motivo de anulación", garantia.motivoAnulacion, "is-internal");

            if (garantia.creadaPor || garantia.reingreso?.registradoPor || garantia.anuladaPor) {
                const metadatos = crearElemento("div", "order-warranty-admin-meta");
                if (garantia.creadaPor) {
                    agregarTexto(
                        metadatos,
                        "Creada por",
                        `${textoActor(garantia.creadaPor)} · ${fechaVisible(garantia.creadaEn, true)}`
                    );
                }
                if (garantia.reingreso?.registradoPor) {
                    agregarTexto(
                        metadatos,
                        "Reingreso registrado por",
                        `${textoActor(garantia.reingreso.registradoPor)} · ${fechaVisible(garantia.reingreso.registradoEn, true)}`
                    );
                }
                if (garantia.anuladaPor) {
                    agregarTexto(
                        metadatos,
                        "Anulada por",
                        textoActor(garantia.anuladaPor)
                    );
                }
                fragmento.appendChild(metadatos);
            }

            if (actions && garantia.estado === "vigente") {
                const fila = crearElemento("div", "order-warranty-actions");
                fila.append(
                    crearBoton(
                        "Registrar reingreso",
                        "fa-rotate-left",
                        "is-primary",
                        mostrarFormularioReingreso
                    ),
                    crearBoton(
                        "Anular garantía",
                        "fa-circle-xmark",
                        "is-danger",
                        mostrarFormularioAnular
                    )
                );
                fragmento.appendChild(fila);
            }
            contenido.replaceChildren(fragmento);
        }

        async function load(nuevaOrdenId, nuevoContexto = {}, opciones = {}) {
            const id = Number(nuevaOrdenId);
            if (!Number.isInteger(id) || id <= 0) {
                ordenId = null;
                renderizarError(
                    new ErrorGarantia("No se pudo identificar la orden seleccionada."),
                    false
                );
                return null;
            }

            ordenId = id;
            contexto = { ...nuevoContexto };
            const silencioso = Boolean(opciones.silencioso);
            const conservarContenido = silencioso && contenido.childElementCount > 0;
            controlador?.abort();
            controlador = new AbortController();
            const solicitud = ++numeroSolicitud;

            if (!conservarContenido) renderizarCarga();
            contenido.querySelector(".order-warranty-inline-error")?.remove();
            cambiarCarga(true);
            try {
                const garantia = await fetchByOrder(apiBase, id, {
                    signal: controlador.signal
                });
                if (solicitud !== numeroSolicitud || id !== ordenId) return null;
                renderizarGarantia(garantia);
                return garantia;
            } catch (error) {
                if (error.name === "AbortError") return null;
                if (solicitud !== numeroSolicitud || id !== ordenId) return null;
                renderizarError(error, conservarContenido);
                return null;
            } finally {
                if (solicitud === numeroSolicitud) cambiarCarga(false);
            }
        }

        function refresh(nuevoContexto = contexto) {
            return load(ordenId, nuevoContexto, { silencioso: true });
        }

        function clear() {
            numeroSolicitud += 1;
            controlador?.abort();
            controlador = null;
            ordenId = null;
            contexto = {};
            garantiaActual = null;
            actualizarEstadoCabecera(null);
            botonActualizar.disabled = true;
            contenido.replaceChildren();
            contenido.setAttribute("aria-busy", "false");
        }

        botonActualizar.addEventListener("click", () => refresh());

        return Object.freeze({
            load,
            refresh,
            clear,
            getData: () => garantiaActual,
            getOrderId: () => ordenId
        });
    }

    global.OrderWarranty = Object.freeze({
        create,
        fetchByOrder,
        renderCompact,
        createReentryBadge,
        legacySnapshot,
        documentLabel,
        fechaVisible
    });
})(window);
