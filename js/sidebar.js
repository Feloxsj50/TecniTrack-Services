const sidebars = document.querySelectorAll(".sidebar");

if (sidebars.length > 0) {
    const page = window.location.pathname.split("/").pop() || "panel_admin.html";

    const adminItems = [
        { section: "General", items: [
            { href: "panel_admin.html", icon: "fa-chart-bar", text: "Dashboard" },
            { href: "clientes.html", icon: "fa-users", text: "Clientes" },
            { href: "tecnicos.html", icon: "fa-user-cog", text: "Técnicos" }
        ]},
        { section: "Reportes", items: [
            { href: "files.html", icon: "fa-folder", text: "Files" },
            { href: "inventario.html", icon: "fa-box", text: "Inventario" },
            { href: "facturacion.html", icon: "fa-file-invoice", text: "Facturación" }
        ]},
        { section: "Configuraciones", items: [
            { href: "ayuda.html", icon: "fa-headset", text: "Ayuda y Soporte" },
            { href: "configuracion.html", icon: "fa-cog", text: "Configuración" }
        ]}
    ];

    const tecnicoItems = [
        { section: "General", items: [
            { href: "panel_tecnico.html", icon: "fa-screwdriver-wrench", text: "Mi Panel" },
            { href: "panel_admin.html", icon: "fa-chart-bar", text: "Dashboard" },
            { href: "inventario.html", icon: "fa-box", text: "Inventario" }
        ]},
        { section: "Soporte", items: [
            { href: "ayuda.html", icon: "fa-headset", text: "Ayuda y Soporte" },
            { href: "configuracion.html", icon: "fa-cog", text: "Configuración" }
        ]}
    ];

    const clienteItems = [
        { section: "General", items: [
            { href: "panel_cliente.html", icon: "fa-house-laptop", text: "Mi Panel" },
            { href: "facturacion.html", icon: "fa-file-invoice", text: "Facturación" }
        ]},
        { section: "Soporte", items: [
            { href: "ayuda.html", icon: "fa-headset", text: "Ayuda y Soporte" },
            { href: "configuracion.html", icon: "fa-cog", text: "Configuración" }
        ]}
    ];

    const menus = {
        "panel_tecnico.html": tecnicoItems,
        "panel_cliente.html": clienteItems
    };

    const menu = menus[page] || adminItems;

    function crearMenu(grupos) {
        return `
            <div class="logo">
                <h2>Tecni<span>Track</span></h2>
                <small>Services</small>
            </div>

            ${grupos.map(grupo => `
                <p class="section">${grupo.section}</p>
                ${grupo.items.map(item => `
                    <a href="${item.href}" class="menu-item ${page === item.href ? "active" : ""}">
                        <i class="fa-solid ${item.icon}"></i> ${item.text}
                    </a>
                `).join("")}
            `).join("")}

            <div class="logout">
                <a href="index.html" id="logoutBtn">
                    <i class="fa-solid fa-right-from-bracket"></i> Cerrar Sesión
                </a>
            </div>
        `;
    }

    sidebars.forEach(sidebar => {
        sidebar.innerHTML = crearMenu(menu);
    });
}



