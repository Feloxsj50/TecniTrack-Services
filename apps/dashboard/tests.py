from datetime import datetime

from django.test import Client, TestCase

from apps.clientes.models import Cliente
from apps.garantias.services import crear_garantia, crear_reingreso
from apps.inventario.models import MovimientoInventario, ProductoInventario
from apps.servicios.history import registrar_evento
from apps.servicios.models import HistorialSolicitud, SolicitudServicio
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import RegistroAuditoria, Usuario

from .activity import obtener_actividad_reciente


class ActividadRecienteTests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_user(
            username="admin_actividad",
            password="AdminActividad123!",
            first_name="Ana",
            last_name="Admin",
            rol=Usuario.Rol.ADMIN,
        )
        self.tecnico_usuario = Usuario.objects.create_user(
            username="tecnico_actividad",
            password="TecnicoActividad123!",
            first_name="Carlos",
            last_name="Técnico",
            rol=Usuario.Rol.TECNICO,
        )
        self.tecnico = Tecnico.objects.create(
            usuario=self.tecnico_usuario,
            especialidad="Hardware",
        )
        self.cliente_usuario = Usuario.objects.create_user(
            username="cliente_actividad",
            password="ClienteActividad123!",
            first_name="Clara",
            last_name="Cliente",
            rol=Usuario.Rol.CLIENTE,
        )
        self.cliente = Cliente.objects.create(usuario=self.cliente_usuario)
        self.orden = SolicitudServicio.objects.create(
            cliente=self.cliente,
            tecnico=self.tecnico,
            dispositivo="Laptop",
            problema="No enciende",
            estado=SolicitudServicio.Estado.EN_PROCESO,
        )
        self.admin_client = Client()
        self.admin_client.force_login(self.admin)

    def crear_producto(self, nombre="SSD NVMe"):
        return ProductoInventario.objects.create(
            nombre=nombre,
            categoria=ProductoInventario.Categoria.ALMACENAMIENTO,
            stock=8,
            stock_minimo=2,
            ubicacion="Estante A",
        )

    def test_endpoint_es_exclusivo_para_administrador(self):
        self.assertEqual(Client().get("/dashboard/actividad-reciente/").status_code, 401)

        tecnico_client = Client()
        tecnico_client.force_login(self.tecnico_usuario)
        self.assertEqual(tecnico_client.get("/dashboard/actividad-reciente/").status_code, 403)

        cliente_client = Client()
        cliente_client.force_login(self.cliente_usuario)
        self.assertEqual(cliente_client.get("/dashboard/actividad-reciente/").status_code, 403)

        self.assertEqual(self.admin_client.get("/dashboard/actividad-reciente/").status_code, 200)

    def test_combina_las_cuatro_fuentes_y_ordena_por_fecha(self):
        registrar_evento(
            self.orden,
            self.tecnico_usuario,
            HistorialSolicitud.TipoEvento.DIAGNOSTICO,
            "Diagnóstico privado: clave interna 9988.",
            HistorialSolicitud.Visibilidad.INTERNO,
        )
        producto = self.crear_producto()
        MovimientoInventario.objects.create(
            producto=producto,
            solicitud=self.orden,
            usuario=self.admin,
            tipo=MovimientoInventario.Tipo.AJUSTE,
            cantidad=2,
            stock_anterior=6,
            stock_nuevo=8,
        )
        RegistroAuditoria.objects.create(
            usuario=self.admin,
            accion="crear_o_actualizar",
            modulo="facturacion",
            objeto_id="12",
            descripcion="Factura F-012 guardada. Nota privada que no debe salir.",
        )
        RegistroAuditoria.objects.create(
            usuario=self.admin,
            accion="crear",
            modulo="soporte",
            objeto_id="7",
            descripcion="Ticket TK-007 creado. Contenido secreto del ticket.",
        )

        respuesta = self.admin_client.get("/dashboard/actividad-reciente/?limite=10")

        self.assertEqual(respuesta.status_code, 200)
        actividades = respuesta.json()["actividades"]
        eventos = {actividad["evento"] for actividad in actividades}
        self.assertTrue({
            "diagnostico",
            "inventario_ajuste",
            "factura_guardada",
            "ticket_creado",
        }.issubset(eventos))
        factura = next(item for item in actividades if item["evento"] == "factura_guardada")
        self.assertEqual(factura["titulo"], "Factura guardada")
        self.assertIn("F-012", factura["descripcion"])
        fechas = [datetime.fromisoformat(item["creadoEn"]) for item in actividades]
        self.assertEqual(fechas, sorted(fechas, reverse=True))

        contenido = respuesta.content.decode("utf-8")
        self.assertNotIn("clave interna 9988", contenido)
        self.assertNotIn("Nota privada", contenido)
        self.assertNotIn("Contenido secreto", contenido)

    def test_reingreso_se_muestra_una_sola_vez(self):
        self.orden.estado = SolicitudServicio.Estado.COMPLETADO
        self.orden.save(update_fields=["estado"])
        garantia = crear_garantia(self.orden.id, 30, self.admin)
        reingreso = crear_reingreso(garantia.id, self.admin, "La falla se repitió")

        actividades = obtener_actividad_reciente(20)
        eventos_reingreso = [
            actividad for actividad in actividades
            if actividad["evento"] == "reingreso_garantia"
        ]

        self.assertEqual(len(eventos_reingreso), 1)
        self.assertNotIn(
            HistorialSolicitud.TipoEvento.GARANTIA_UTILIZADA,
            [actividad["evento"] for actividad in actividades],
        )
        self.assertFalse(any(
            actividad["evento"] == HistorialSolicitud.TipoEvento.CREACION
            and actividad["referencia"]["id"] == reingreso.solicitud_reingreso_id
            for actividad in actividades
        ))
        self.assertEqual(
            eventos_reingreso[0]["referencia"]["id"],
            reingreso.solicitud_reingreso_id,
        )

    def test_referencia_de_orden_permite_abrir_el_detalle(self):
        evento = registrar_evento(
            self.orden,
            self.admin,
            HistorialSolicitud.TipoEvento.INICIO,
            "El servicio fue iniciado.",
            estado_anterior=SolicitudServicio.Estado.PENDIENTE,
            estado_nuevo=SolicitudServicio.Estado.EN_PROCESO,
        )

        actividad = next(
            item for item in obtener_actividad_reciente(10)
            if item["id"] == f"orden-{evento.id}"
        )

        self.assertEqual(actividad["referencia"], {
            "tipo": "orden",
            "id": self.orden.id,
            "codigo": f"SOL-{self.orden.id:03d}",
        })

    def test_conserva_actor_del_historial_y_protege_auditoria_eliminada(self):
        evento = registrar_evento(
            self.orden,
            self.tecnico_usuario,
            HistorialSolicitud.TipoEvento.INICIO,
            "El servicio fue iniciado.",
        )
        usuario_temporal = Usuario.objects.create_user(
            username="admin_temporal_actividad",
            password="TemporalActividad123!",
            rol=Usuario.Rol.ADMIN,
        )
        auditoria = RegistroAuditoria.objects.create(
            usuario=usuario_temporal,
            accion="responder",
            modulo="soporte",
            objeto_id="4",
            descripcion="Ticket TK-004 respondido.",
        )
        usuario_temporal.delete()

        actividades = obtener_actividad_reciente(10)
        actividad_historial = next(item for item in actividades if item["id"] == f"orden-{evento.id}")
        actividad_auditoria = next(item for item in actividades if item["id"] == f"auditoria-{auditoria.id}")

        self.assertEqual(actividad_historial["actor"]["nombre"], "Carlos Técnico")
        self.assertEqual(actividad_auditoria["actor"]["nombre"], "Usuario eliminado")

    def test_limite_se_restringe_entre_uno_y_veinte(self):
        for indice in range(25):
            RegistroAuditoria.objects.create(
                usuario=self.admin,
                accion="crear",
                modulo="soporte",
                objeto_id=str(indice + 1),
                descripcion=f"Ticket TK-{indice + 1:03d} creado.",
            )

        self.assertEqual(
            len(self.admin_client.get("/dashboard/actividad-reciente/?limite=100").json()["actividades"]),
            20,
        )
        self.assertEqual(
            len(self.admin_client.get("/dashboard/actividad-reciente/?limite=0").json()["actividades"]),
            1,
        )
        self.assertEqual(
            self.admin_client.get("/dashboard/actividad-reciente/?limite=abc").status_code,
            400,
        )

    def test_estado_vacio(self):
        respuesta = self.admin_client.get("/dashboard/actividad-reciente/")

        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()["actividades"], [])
        self.assertIn("generadoEn", respuesta.json())

    def test_consulta_acotada_sin_n_mas_uno(self):
        producto = self.crear_producto()
        for indice in range(5):
            registrar_evento(
                self.orden,
                self.admin,
                HistorialSolicitud.TipoEvento.CAMBIO_ESTADO,
                "Cambio de estado.",
                estado_anterior=SolicitudServicio.Estado.PENDIENTE,
                estado_nuevo=SolicitudServicio.Estado.EN_PROCESO,
            )
            MovimientoInventario.objects.create(
                producto=producto,
                usuario=self.admin,
                tipo=MovimientoInventario.Tipo.AJUSTE,
                cantidad=1,
                stock_anterior=indice,
                stock_nuevo=indice + 1,
            )
            RegistroAuditoria.objects.create(
                usuario=self.admin,
                accion="crear",
                modulo="soporte",
                objeto_id=str(indice + 1),
                descripcion=f"Ticket TK-{indice + 1:03d} creado.",
            )

        with self.assertNumQueries(4):
            actividades = obtener_actividad_reciente(10)

        self.assertEqual(len(actividades), 10)

    def test_rechaza_metodos_distintos_de_get(self):
        self.assertEqual(
            self.admin_client.post("/dashboard/actividad-reciente/").status_code,
            405,
        )
