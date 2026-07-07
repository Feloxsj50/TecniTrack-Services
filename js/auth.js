(function () {
    const SESSION_KEY = "tecnitrackSesion";
    const ROLE_KEY = "rolActual";
    const MESSAGE_KEY = "tecnitrackMensaje";
    const publicPages = ["auth/index.html", "auth/registro.html"];
    const permissions = {
        admin: [
            "admin/panel_admin.html", "admin/clientes.html", "admin/tecnicos.html",
            "admin/files.html", "admin/inventario.html", "admin/facturacion.html",
            "admin/configuracion.html", "tecnico/panel_tecnico.html",
            "tecnico/inventario.html", "cliente/panel_cliente.html",
            "cliente/mis-pagos.html", "shared/perfil.html", "shared/ayuda.html"
        ],
        tecnico: [
            "tecnico/panel_tecnico.html", "tecnico/inventario.html", "tecnico/mis-trabajos.html",
            "shared/perfil.html", "shared/ayuda.html"
        ],
        cliente: [
            "cliente/panel_cliente.html", "cliente/mis-pagos.html",
            "shared/perfil.html", "shared/ayuda.html"
        ]
    };
    const homePages = {
        admin: "admin/panel_admin.html",
        tecnico: "tecnico/panel_tecnico.html",
        cliente: "cliente/panel_cliente.html"
    };

    const pagesRoot = () => new URL("../", window.location.href);
    const pageUrl = route => new URL(route, pagesRoot()).href;
    const currentRoute = () => {
        const parts = window.location.pathname.split("/").filter(Boolean);
        return parts.slice(-2).join("/");
    };
    const saveMessage = (mensaje, tipo = "info") => {
        sessionStorage.setItem(MESSAGE_KEY, JSON.stringify({ mensaje, tipo }));
    };

    function getSession() {
        try {
            return JSON.parse(sessionStorage.getItem(SESSION_KEY));
        } catch {
            return null;
        }
    }

    function login(rol, usuario, datos = {}) {
        if (!permissions[rol]) return false;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            rol,
            usuario,
            datos,
            inicio: new Date().toISOString()
        }));
        sessionStorage.setItem(ROLE_KEY, rol);
        return true;
    }

    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(ROLE_KEY);
        saveMessage("Sesión cerrada correctamente.", "success");
        window.location.replace(pageUrl("auth/index.html"));
    }

    function canAccess(rol, pagina) {
        return Boolean(permissions[rol]?.includes(pagina));
    }

    function protectPage() {
        const route = currentRoute();
        if (publicPages.includes(route)) return;

        document.documentElement.style.visibility = "hidden";
        const session = getSession();
        if (!session || !permissions[session.rol]) {
            saveMessage("Iniciá sesión para acceder al sistema.", "error");
            window.location.replace(pageUrl("auth/index.html"));
            return;
        }

        if (!canAccess(session.rol, route)) {
            saveMessage("Tu rol no tiene permiso para acceder a esa página.", "error");
            window.location.replace(pageUrl(homePages[session.rol]));
            return;
        }

        document.documentElement.style.visibility = "";
    }

    window.TecniAuth = {
        iniciarSesion: login,
        cerrarSesion: logout,
        obtenerSesion: getSession,
        puedeAcceder: canAccess,
        paginaInicio: rol => pageUrl(homePages[rol] || "auth/index.html"),
        urlPagina: pageUrl,
        rutaActual: currentRoute
    };

    protectPage();

    window.addEventListener("pageshow", event => {
        if (event.persisted) protectPage();
    });
})();
