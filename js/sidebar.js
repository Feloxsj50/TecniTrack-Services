const sidebars = document.querySelectorAll(".sidebar");

if (sidebars.length > 0) {
    const page = TecniAuth.rutaActual();

    const adminItems = [
        { section: "General", items: [
            { href: "admin/panel_admin.html", icon: "fa-chart-bar", text: "Dashboard" },
            { href: "admin/clientes.html", icon: "fa-users", text: "Clientes" },
            { href: "admin/tecnicos.html", icon: "fa-user-cog", text: "Técnicos" }
        ]},
        { section: "Reportes", items: [
            { href: "admin/files.html", icon: "fa-folder", text: "Reportes" },
            { href: "admin/inventario.html", icon: "fa-box", text: "Inventario" },
            { href: "admin/facturacion.html", icon: "fa-file-invoice", text: "Facturación" }
        ]},
        { section: "Configuraciones", items: [
            { href: "shared/perfil.html", icon: "fa-user-circle", text: "Perfil" },
            { href: "shared/ayuda.html", icon: "fa-headset", text: "Ayuda y Soporte" },
            { href: "admin/configuracion.html", icon: "fa-cog", text: "Configuración" }
        ]}
    ];

    const tecnicoItems = [
        { section: "General", items: [
            { href: "tecnico/panel_tecnico.html", icon: "fa-screwdriver-wrench", text: "Mi Panel" },
            { href: "tecnico/mis-trabajos.html", icon: "fa-clipboard-check", text: "Mis Trabajos" }
        ]},
        { section: "Soporte", items: [
            { href: "shared/perfil.html", icon: "fa-user-circle", text: "Perfil" },
            { href: "shared/ayuda.html", icon: "fa-headset", text: "Ayuda y Soporte" }
        ]}
    ];

    const clienteItems = [
        { section: "General", items: [
            { href: "cliente/panel_cliente.html", icon: "fa-house-laptop", text: "Mi Panel" },
            { href: "cliente/mis-pagos.html", icon: "fa-receipt", text: "Mis recibos" }
        ]},
        { section: "Soporte", items: [
            { href: "shared/perfil.html", icon: "fa-user-circle", text: "Perfil" },
            { href: "shared/ayuda.html", icon: "fa-headset", text: "Ayuda y Soporte" }
        ]}
    ];

    const menus = {
        "tecnico/panel_tecnico.html": tecnicoItems,
        "cliente/panel_cliente.html": clienteItems
    };

    function obtenerMenuActual() {
        if (menus[page]) return menus[page];

        const rolActual = TecniAuth.obtenerSesion()?.rol || "admin";

        if (rolActual === "tecnico") return tecnicoItems;
        if (rolActual === "cliente") return clienteItems;
        return adminItems;
    }

    const menu = obtenerMenuActual();

    function crearMenu(grupos) {
        return `
            <div class="logo">
                <h2>Tecni<span>Track</span></h2>
                <small>Services</small>
                <button type="button" class="notification-trigger" id="btnNotificaciones" title="Notificaciones" aria-label="Notificaciones">
                    <i class="fa-solid fa-bell"></i><span id="contadorNotificaciones" hidden>0</span>
                </button>
            </div>

            ${grupos.map(grupo => `
                <p class="section">${grupo.section}</p>
                ${grupo.items.map(item => `
                    <a href="${TecniAuth.urlPagina(item.href)}" class="menu-item ${page === item.href ? "active" : ""}">
                        <i class="fa-solid ${item.icon}"></i> ${item.text}
                    </a>
                `).join("")}
            `).join("")}

            <div class="logout">
                <a href="${TecniAuth.urlPagina("auth/index.html")}" id="logoutBtn">
                    <i class="fa-solid fa-right-from-bracket"></i> Cerrar Sesión
                </a>
            </div>
        `;
    }

    sidebars.forEach(sidebar => {
        sidebar.innerHTML = crearMenu(menu);
    });

    if (!document.getElementById("mobileSidebarToggle")) {
        document.body.insertAdjacentHTML("afterbegin", `<button type="button" id="mobileSidebarToggle" class="mobile-sidebar-toggle" aria-label="Abrir menú"><i class="fa-solid fa-bars"></i></button>`);
    }
    document.getElementById("mobileSidebarToggle")?.addEventListener("click", () => {
        document.body.classList.toggle("sidebar-open");
    });

    const API_BASE = ["5500", "5501", "5173"].includes(window.location.port)
        ? (window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000")
        : window.location.origin;
    let notificaciones = [];

    function pintarNotificaciones() {
        const noLeidas = notificaciones.filter(item => !item.leida).length;
        const contador = document.getElementById("contadorNotificaciones");
        if (contador) {
            contador.textContent = noLeidas;
            contador.hidden = noLeidas === 0;
        }
    }

    function abrirNotificaciones() {
        let panel = document.getElementById("panelNotificaciones");
        if (!panel) {
            panel = document.createElement("section");
            panel.id = "panelNotificaciones";
            panel.className = "notifications-panel";
            document.body.appendChild(panel);
        }
        panel.innerHTML = `
            <div class="notifications-panel-header"><strong>Notificaciones</strong><div><button type="button" data-leer-todas>Marcar todas</button><button type="button" data-cerrar-notificaciones aria-label="Cerrar">&times;</button></div></div>
            <div class="notifications-list">
                ${notificaciones.length ? notificaciones.map(item => `
                    <button type="button" class="notification-item ${item.leida ? "read" : ""}" data-notificacion="${item.id}">
                        <strong>${item.titulo}</strong><span>${item.mensaje}</span>
                    </button>
                `).join("") : `<p class="notifications-empty">No tienes notificaciones nuevas.</p>`}
            </div>
        `;
        panel.hidden = false;
        panel.querySelector("[data-cerrar-notificaciones]").addEventListener("click", () => { panel.hidden = true; });
        panel.querySelector("[data-leer-todas]").addEventListener("click", async () => {
            await fetch(`${API_BASE}/usuarios/notificaciones/leer-todas/`, { method: "POST", credentials: "include", headers: { "X-CSRFToken": await obtenerCsrfNotificaciones() } });
            notificaciones = notificaciones.map(item => ({ ...item, leida: true }));
            pintarNotificaciones();
            abrirNotificaciones();
        });
        panel.querySelectorAll("[data-notificacion]").forEach(item => item.addEventListener("click", async () => {
            const id = item.dataset.notificacion;
            await fetch(`${API_BASE}/usuarios/notificaciones/${id}/leer/`, { method: "POST", credentials: "include", headers: { "X-CSRFToken": await obtenerCsrfNotificaciones() } });
            const encontrada = notificaciones.find(notification => String(notification.id) === String(id));
            if (encontrada) encontrada.leida = true;
            pintarNotificaciones();
            item.classList.add("read");
        }));
    }

    function getCookie(nombre) {
        return document.cookie.split("; ").find(item => item.startsWith(`${nombre}=`))?.split("=")[1] || "";
    }

    let csrfNotificaciones = "";
    async function obtenerCsrfNotificaciones() {
        if (csrfNotificaciones) return csrfNotificaciones;
        const respuesta = await fetch(`${API_BASE}/usuarios/csrf/`, { credentials: "include" });
        const datos = await respuesta.json();
        if (!respuesta.ok || !datos.ok) throw new Error("No se pudo preparar la seguridad de las notificaciones.");
        csrfNotificaciones = datos.csrfToken;
        return csrfNotificaciones;
    }

    let ultimoNoLeidas = 0;
    function emitirSonidoNotificacion() {
        try {
            const contexto = new AudioContext();
            const oscilador = contexto.createOscillator();
            const ganancia = contexto.createGain();
            oscilador.frequency.value = 660;
            ganancia.gain.setValueAtTime(0.04, contexto.currentTime);
            ganancia.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + 0.16);
            oscilador.connect(ganancia).connect(contexto.destination);
            oscilador.start();
            oscilador.stop(contexto.currentTime + 0.16);
        } catch {
            // El sonido puede ser bloqueado por el navegador.
        }
    }

    async function cargarNotificaciones() {
        try {
            const respuesta = await fetch(`${API_BASE}/usuarios/notificaciones/`, { credentials: "include" });
            const datos = await respuesta.json();
            if (!respuesta.ok || !datos.ok) return;
            notificaciones = datos.notificaciones || [];
            pintarNotificaciones();
            if (ultimoNoLeidas && datos.noLeidas > ultimoNoLeidas) emitirSonidoNotificacion();
            ultimoNoLeidas = datos.noLeidas || 0;
        } catch {
            // Las notificaciones no deben bloquear la navegación.
        }
    }

    document.getElementById("btnNotificaciones")?.addEventListener("click", abrirNotificaciones);
    cargarNotificaciones();
    window.setInterval(cargarNotificaciones, 30000);

    document.getElementById("logoutBtn")?.addEventListener("click", event => {
        event.preventDefault();
        TecniAuth.cerrarSesion();
    });
}



