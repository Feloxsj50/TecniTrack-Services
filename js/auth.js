(function () {
    const SESSION_KEY = "tecnitrackSesion";
    const ROLE_KEY = "rolActual";
    const MESSAGE_KEY = "tecnitrackMensaje";
    const publicPages = ["index.html", "registro.html"];
    const permissions = {
        admin: ["panel_admin.html", "clientes.html", "tecnicos.html", "files.html", "inventario.html", "facturacion.html", "perfil.html", "ayuda.html", "configuracion.html", "panel_tecnico.html", "panel_cliente.html"],
        tecnico: ["panel_tecnico.html", "inventario.html", "perfil.html", "ayuda.html"],
        cliente: ["panel_cliente.html", "facturacion.html", "perfil.html", "ayuda.html"]
    };
    const homePages = {
        admin: "panel_admin.html",
        tecnico: "panel_tecnico.html",
        cliente: "panel_cliente.html"
    };

    const currentPage = () => window.location.pathname.split("/").pop() || "index.html";
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

    function login(rol, usuario) {
        if (!permissions[rol]) return false;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            rol,
            usuario,
            inicio: new Date().toISOString()
        }));
        sessionStorage.setItem(ROLE_KEY, rol);
        return true;
    }

    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(ROLE_KEY);
        saveMessage("Sesión cerrada correctamente.", "success");
        window.location.replace("index.html");
    }

    function canAccess(rol, pagina) {
        return Boolean(permissions[rol]?.includes(pagina));
    }

    function protectPage() {
        const page = currentPage();
        if (publicPages.includes(page)) return;

        document.documentElement.style.visibility = "hidden";
        const session = getSession();
        if (!session || !permissions[session.rol]) {
            saveMessage("Iniciá sesión para acceder al sistema.", "error");
            window.location.replace("index.html");
            return;
        }

        if (!canAccess(session.rol, page)) {
            saveMessage("Tu rol no tiene permiso para acceder a esa página.", "error");
            window.location.replace(homePages[session.rol]);
            return;
        }

        document.documentElement.style.visibility = "";
    }

    window.TecniAuth = {
        iniciarSesion: login,
        cerrarSesion: logout,
        obtenerSesion: getSession,
        puedeAcceder: canAccess,
        paginaInicio: rol => homePages[rol] || "index.html"
    };

    protectPage();

    window.addEventListener("pageshow", event => {
        if (event.persisted) protectPage();
    });
})();
