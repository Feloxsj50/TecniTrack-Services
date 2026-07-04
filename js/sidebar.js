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
            { href: "tecnico/inventario.html", icon: "fa-box", text: "Inventario" }
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

    document.getElementById("logoutBtn")?.addEventListener("click", event => {
        event.preventDefault();
        TecniAuth.cerrarSesion();
    });
}



