import json
from datetime import date

from django.test import Client, TestCase

from apps.clientes.models import Cliente
from apps.facturacion.models import Factura
from apps.garantias.services import crear_garantia, crear_reingreso
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Notificacion, Usuario
from .history import registrar_asignacion, registrar_creacion, registrar_diagnostico
from .models import HistorialSolicitud, SolicitudServicio
from .views import queryset_por_rol, serializar_solicitud


class FlujoOrdenesTests(TestCase):
    def setUp(self):
        self.cliente_usuario = Usuario.objects.create_user(
            username="cliente_test",
            password="ClienteTest123!",
            first_name="Cliente",
            last_name="Prueba",
            email="cliente@test.local",
            telefono="7777-1000",
            rol=Usuario.Rol.CLIENTE,
        )
        self.cliente = Cliente.objects.create(usuario=self.cliente_usuario)

        self.tecnico_usuario = Usuario.objects.create_user(
            username="tecnico_test",
            password="TecnicoTest123!",
            first_name="Tecnico",
            last_name="Prueba",
            email="tecnico@test.local",
            telefono="7777-1001",
            rol=Usuario.Rol.TECNICO,
        )
        self.tecnico = Tecnico.objects.create(
            usuario=self.tecnico_usuario,
            especialidad="Diagnostico",
        )

        self.admin = Usuario.objects.create_superuser(
            username="admin_test",
            password="AdminTest123!",
            email="admin@test.local",
        )
        self.admin.rol = Usuario.Rol.ADMIN
        self.admin.activo = True
        self.admin.save(update_fields=["rol", "activo"])

        self.cliente_client = Client()
        self.cliente_client.force_login(self.cliente_usuario)
        self.tecnico_client = Client()
        self.tecnico_client.force_login(self.tecnico_usuario)
        self.admin_client = Client()
        self.admin_client.force_login(self.admin)

    def crear_orden(self, tecnico=None, estado=SolicitudServicio.Estado.PENDIENTE):
        return SolicitudServicio.objects.create(
            cliente=self.cliente,
            tecnico=tecnico,
            dispositivo="Laptop de prueba",
            problema="No enciende",
            fecha_preferida=date.today(),
            prioridad=SolicitudServicio.Prioridad.ALTA,
            estado=estado,
        )

    def actualizar_como_admin(self, solicitud, tecnico="", estado="Pendiente"):
        return self.admin_client.post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps({
                "clienteId": str(self.cliente.id),
                "cliente": "Cliente Prueba",
                "dispositivo": solicitud.dispositivo,
                "servicio": solicitud.problema,
                "fecha": date.today().isoformat(),
                "tecnico": tecnico,
                "prioridad": "Alta",
                "estado": estado,
            }),
            content_type="application/json",
        )

    def actualizar_como_tecnico(self, solicitud, estado, diagnostico="", repuesto=""):
        return self.tecnico_client.post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps({
                "diagnostico": diagnostico,
                "repuesto": repuesto,
                "estado": estado,
            }),
            content_type="application/json",
        )

    def test_cliente_puede_crear_una_solicitud(self):
        cliente_client = Client()
        self.assertTrue(cliente_client.login(username="cliente_test", password="ClienteTest123!"))

        respuesta = cliente_client.post(
            "/servicios/crear/",
            data=json.dumps({
                "dispositivo": "Laptop de prueba",
                "servicio": "No enciende",
                "fecha": date.today().isoformat(),
                "prioridad": "Alta",
            }),
            content_type="application/json",
        )

        self.assertEqual(respuesta.status_code, 201)
        solicitud = SolicitudServicio.objects.get()
        self.assertEqual(solicitud.cliente, self.cliente)
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.PENDIENTE)
        self.assertTrue(Notificacion.objects.filter(usuario=self.admin).exists())
        evento = HistorialSolicitud.objects.get(solicitud=solicitud)
        self.assertEqual(evento.accion, HistorialSolicitud.TipoEvento.CREACION)
        self.assertEqual(evento.visibilidad, HistorialSolicitud.Visibilidad.PUBLICO)
        self.assertEqual(evento.usuario, self.cliente_usuario)
        self.assertEqual(evento.usuario_username, "cliente_test")
        self.assertEqual(evento.usuario_nombre, "Cliente Prueba")
        self.assertEqual(evento.usuario_rol, Usuario.Rol.CLIENTE)
        self.assertEqual(evento.estado_nuevo, SolicitudServicio.Estado.PENDIENTE)
        self.assertEqual(evento.solicitud_codigo, f"SOL-{solicitud.id:03d}")

    def test_admin_asigna_y_tecnico_completa_la_orden(self):
        solicitud = SolicitudServicio.objects.create(
            cliente=self.cliente,
            dispositivo="Laptop de prueba",
            problema="No enciende",
            fecha_preferida=date.today(),
            prioridad=SolicitudServicio.Prioridad.ALTA,
        )

        admin_client = Client()
        self.assertTrue(admin_client.login(username="admin_test", password="AdminTest123!"))
        respuesta = admin_client.post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps({
                "clienteId": str(self.cliente.id),
                "cliente": "Cliente Prueba",
                "dispositivo": "Laptop de prueba",
                "servicio": "No enciende",
                "fecha": date.today().isoformat(),
                "tecnico": "tecnico_test",
                "prioridad": "Alta",
                "estado": "Pendiente",
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 200)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.tecnico, self.tecnico)
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.PENDIENTE)
        asignacion = HistorialSolicitud.objects.get(solicitud=solicitud)
        self.assertEqual(asignacion.accion, HistorialSolicitud.TipoEvento.ASIGNACION)
        self.assertIsNone(asignacion.tecnico_anterior)
        self.assertEqual(asignacion.tecnico_nuevo, self.tecnico)
        self.assertEqual(asignacion.tecnico_nuevo_username, "tecnico_test")
        self.assertEqual(asignacion.estado_anterior, "")
        self.assertEqual(asignacion.estado_nuevo, "")
        self.assertFalse(
            HistorialSolicitud.objects.filter(
                solicitud=solicitud,
                accion=HistorialSolicitud.TipoEvento.INICIO,
            ).exists()
        )

        tecnico_client = Client()
        self.assertTrue(tecnico_client.login(username="tecnico_test", password="TecnicoTest123!"))
        respuesta_inicio = tecnico_client.post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps({
                "diagnostico": "",
                "repuesto": "",
                "estado": "En proceso",
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta_inicio.status_code, 200)
        respuesta = tecnico_client.post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps({
                "diagnostico": "Se reviso el equipo y se reparo correctamente.",
                "repuesto": "Sin repuesto",
                "estado": "Completado",
            }),
            content_type="application/json",
        )

        self.assertEqual(respuesta.status_code, 200)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.tecnico, self.tecnico)
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.COMPLETADO)
        self.assertEqual(solicitud.diagnostico, "Se reviso el equipo y se reparo correctamente.")
        self.assertEqual(
            list(
                HistorialSolicitud.objects.filter(solicitud=solicitud)
                .values_list("accion", flat=True)
            ),
            [
                HistorialSolicitud.TipoEvento.ASIGNACION,
                HistorialSolicitud.TipoEvento.INICIO,
                HistorialSolicitud.TipoEvento.DIAGNOSTICO,
                HistorialSolicitud.TipoEvento.FINALIZACION,
            ],
        )

    def test_cliente_no_puede_ver_historial_de_otra_orden(self):
        otra_orden = SolicitudServicio.objects.create(
            cliente=self.cliente,
            dispositivo="Equipo ajeno",
            problema="No enciende",
            fecha_preferida=date.today(),
        )
        otro_usuario = Usuario.objects.create_user(
            username="otro_cliente", password="OtroCliente123!", rol=Usuario.Rol.CLIENTE,
            email="otro@test.local",
        )
        otro_cliente = Cliente.objects.create(usuario=otro_usuario)
        otra_orden.cliente = otro_cliente
        otra_orden.save(update_fields=["cliente"])

        cliente_client = Client()
        self.assertTrue(cliente_client.login(username="cliente_test", password="ClienteTest123!"))
        respuesta = cliente_client.get(f"/servicios/{otra_orden.id}/historial/")
        self.assertEqual(respuesta.status_code, 403)

    def test_no_crea_orden_incompleta(self):
        cliente_client = Client()
        self.assertTrue(cliente_client.login(username="cliente_test", password="ClienteTest123!"))
        respuesta = cliente_client.post(
            "/servicios/crear/",
            data=json.dumps({"dispositivo": "Laptop", "servicio": ""}),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(SolicitudServicio.objects.exists())

    def test_cliente_no_puede_eliminar_orden(self):
        solicitud = SolicitudServicio.objects.create(
            cliente=self.cliente, dispositivo="Laptop", problema="No enciende", fecha_preferida=date.today(),
        )
        cliente_client = Client()
        self.assertTrue(cliente_client.login(username="cliente_test", password="ClienteTest123!"))
        respuesta = cliente_client.post(f"/servicios/{solicitud.id}/eliminar/")
        self.assertEqual(respuesta.status_code, 403)
        self.assertTrue(SolicitudServicio.objects.filter(id=solicitud.id).exists())

    def test_tecnico_debe_iniciar_antes_de_finalizar(self):
        solicitud = self.crear_orden(tecnico=self.tecnico)

        respuesta = self.actualizar_como_tecnico(
            solicitud,
            "Completado",
            diagnostico="Se reparó correctamente la fuente de poder.",
        )

        self.assertEqual(respuesta.status_code, 400)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.PENDIENTE)
        self.assertFalse(HistorialSolicitud.objects.filter(solicitud=solicitud).exists())

    def test_inicio_precede_al_diagnostico_en_la_misma_actualizacion(self):
        solicitud = self.crear_orden(tecnico=self.tecnico)

        respuesta = self.actualizar_como_tecnico(
            solicitud,
            "En proceso",
            diagnostico="Se inició la revisión de la tarjeta principal.",
        )

        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(
            list(
                HistorialSolicitud.objects.filter(solicitud=solicitud)
                .values_list("accion", flat=True)
            ),
            [
                HistorialSolicitud.TipoEvento.INICIO,
                HistorialSolicitud.TipoEvento.DIAGNOSTICO,
            ],
        )

    def test_cambio_de_estado_generico_se_registra(self):
        solicitud = self.crear_orden(estado=SolicitudServicio.Estado.CANCELADO)

        respuesta = self.actualizar_como_admin(solicitud, estado="Pendiente")

        self.assertEqual(respuesta.status_code, 200)
        evento = HistorialSolicitud.objects.get(solicitud=solicitud)
        self.assertEqual(evento.accion, HistorialSolicitud.TipoEvento.CAMBIO_ESTADO)
        self.assertEqual(evento.estado_anterior, SolicitudServicio.Estado.CANCELADO)
        self.assertEqual(evento.estado_nuevo, SolicitudServicio.Estado.PENDIENTE)

    def test_diagnostico_es_un_evento_interno(self):
        solicitud = self.crear_orden(
            tecnico=self.tecnico,
            estado=SolicitudServicio.Estado.EN_PROCESO,
        )

        respuesta = self.actualizar_como_tecnico(
            solicitud,
            "En proceso",
            diagnostico="La fuente de poder presenta una falla estable.",
            repuesto="Fuente de poder",
        )

        self.assertEqual(respuesta.status_code, 200)
        evento = HistorialSolicitud.objects.get(solicitud=solicitud)
        self.assertEqual(evento.accion, HistorialSolicitud.TipoEvento.DIAGNOSTICO)
        self.assertEqual(evento.visibilidad, HistorialSolicitud.Visibilidad.INTERNO)
        self.assertEqual(evento.estado_anterior, "")
        self.assertEqual(evento.estado_nuevo, "")
        self.assertIn("Fuente de poder", evento.descripcion)

    def test_cancelacion_se_registra(self):
        solicitud = self.crear_orden()

        respuesta = self.actualizar_como_admin(solicitud, estado="Cancelado")

        self.assertEqual(respuesta.status_code, 200)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.CANCELADO)
        evento = HistorialSolicitud.objects.get(solicitud=solicitud)
        self.assertEqual(evento.accion, HistorialSolicitud.TipoEvento.CANCELACION)
        self.assertEqual(evento.visibilidad, HistorialSolicitud.Visibilidad.PUBLICO)

    def crear_historial_publico_e_interno(self):
        solicitud = self.crear_orden(tecnico=self.tecnico)
        registrar_creacion(solicitud, self.admin)
        registrar_asignacion(solicitud, self.admin, None, self.tecnico)
        solicitud.diagnostico = "Falla interna de la placa principal."
        solicitud.repuesto_usado = "Placa principal"
        solicitud.save(update_fields=["diagnostico", "repuesto_usado"])
        registrar_diagnostico(solicitud, self.tecnico_usuario)
        return solicitud

    def test_admin_ve_historial_completo(self):
        solicitud = self.crear_historial_publico_e_interno()

        respuesta = self.admin_client.get(f"/servicios/{solicitud.id}/historial/")

        self.assertEqual(respuesta.status_code, 200)
        datos = respuesta.json()
        self.assertEqual(datos["solicitud"]["codigo"], f"SOL-{solicitud.id:03d}")
        self.assertEqual(len(datos["historial"]), 3)
        diagnostico = next(
            evento for evento in datos["historial"]
            if evento["accion"] == HistorialSolicitud.TipoEvento.DIAGNOSTICO
        )
        self.assertEqual(diagnostico["visibilidad"], HistorialSolicitud.Visibilidad.INTERNO)
        self.assertEqual(diagnostico["usuario"]["id"], self.tecnico_usuario.id)
        self.assertEqual(diagnostico["usuario"]["username"], "tecnico_test")

    def test_tecnico_asignado_ve_historial_completo(self):
        solicitud = self.crear_historial_publico_e_interno()

        respuesta = self.tecnico_client.get(f"/servicios/{solicitud.id}/historial/")

        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(len(respuesta.json()["historial"]), 3)
        self.assertIn("username", respuesta.json()["historial"][0]["usuario"])

        otro_usuario = Usuario.objects.create_user(
            username="otro_tecnico",
            password="OtroTecnico123!",
            rol=Usuario.Rol.TECNICO,
            email="otro.tecnico@test.local",
        )
        Tecnico.objects.create(usuario=otro_usuario, especialidad="Redes")
        otro_client = Client()
        otro_client.force_login(otro_usuario)
        respuesta_ajena = otro_client.get(f"/servicios/{solicitud.id}/historial/")
        self.assertEqual(respuesta_ajena.status_code, 403)

    def test_cliente_solo_ve_eventos_publicos_sin_datos_internos(self):
        solicitud = self.crear_historial_publico_e_interno()

        respuesta = self.cliente_client.get(f"/servicios/{solicitud.id}/historial/")

        self.assertEqual(respuesta.status_code, 200)
        eventos = respuesta.json()["historial"]
        self.assertEqual(len(eventos), 2)
        self.assertNotIn(
            HistorialSolicitud.TipoEvento.DIAGNOSTICO,
            [evento["accion"] for evento in eventos],
        )
        for evento in eventos:
            self.assertEqual(evento["visibilidad"], HistorialSolicitud.Visibilidad.PUBLICO)
            self.assertNotIn("id", evento["usuario"])
            self.assertNotIn("username", evento["usuario"])

        asignacion = next(
            evento for evento in eventos
            if evento["accion"] == HistorialSolicitud.TipoEvento.ASIGNACION
        )
        self.assertEqual(asignacion["tecnicoNuevo"], {"nombre": "Tecnico Prueba"})

    def test_identidad_del_actor_permanece_si_el_usuario_es_eliminado(self):
        solicitud = self.crear_orden()
        actor = Usuario.objects.create_user(
            username="admin_temporal",
            password="AdminTemporal123!",
            first_name="Ana",
            last_name="Temporal",
            email="ana.temporal@test.local",
            rol=Usuario.Rol.ADMIN,
        )
        evento = registrar_creacion(solicitud, actor)

        actor.delete()
        evento.refresh_from_db()

        self.assertIsNone(evento.usuario)
        self.assertEqual(evento.usuario_username, "admin_temporal")
        self.assertEqual(evento.usuario_nombre, "Ana Temporal")
        self.assertEqual(evento.usuario_rol, Usuario.Rol.ADMIN)

    def test_listado_de_ordenes_respeta_el_rol(self):
        propia = self.crear_orden(tecnico=self.tecnico)
        otro_usuario = Usuario.objects.create_user(
            username="cliente_listado",
            password="ClienteListado123!",
            rol=Usuario.Rol.CLIENTE,
            email="cliente.listado@test.local",
        )
        otro_cliente = Cliente.objects.create(usuario=otro_usuario)
        ajena = SolicitudServicio.objects.create(
            cliente=otro_cliente,
            dispositivo="Teléfono",
            problema="Pantalla dañada",
            fecha_preferida=date.today(),
        )

        respuesta_cliente = self.cliente_client.get("/servicios/")
        respuesta_tecnico = self.tecnico_client.get("/servicios/")
        respuesta_admin = self.admin_client.get("/servicios/")

        self.assertEqual(
            [item["dbId"] for item in respuesta_cliente.json()["solicitudes"]],
            [propia.id],
        )
        self.assertEqual(
            [item["dbId"] for item in respuesta_tecnico.json()["solicitudes"]],
            [propia.id],
        )
        self.assertEqual(
            {item["dbId"] for item in respuesta_admin.json()["solicitudes"]},
            {propia.id, ajena.id},
        )

    def test_listado_identifica_reingreso_sin_consultas_n_mas_uno(self):
        original = self.crear_orden(
            tecnico=self.tecnico,
            estado=SolicitudServicio.Estado.COMPLETADO,
        )
        Factura.objects.create(solicitud=original, total="75.00")
        garantia = crear_garantia(original.id, 30, self.admin)
        reingreso = crear_reingreso(garantia.id, self.admin, "La falla se repitió")

        with self.assertNumQueries(1):
            datos = [
                serializar_solicitud(solicitud)
                for solicitud in queryset_por_rol(self.admin)
            ]

        original_json = next(item for item in datos if item["dbId"] == original.id)
        reingreso_json = next(
            item
            for item in datos
            if item["dbId"] == reingreso.solicitud_reingreso_id
        )
        self.assertTrue(original_json["facturada"])
        self.assertFalse(original_json["esReingresoGarantia"])
        self.assertIsNone(original_json["ordenOriginalGarantia"])
        self.assertFalse(reingreso_json["facturada"])
        self.assertTrue(reingreso_json["esReingresoGarantia"])
        self.assertEqual(
            reingreso_json["ordenOriginalGarantia"],
            {"id": original.id, "codigo": f"SOL-{original.id:03d}"},
        )
