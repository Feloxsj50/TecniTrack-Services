import json
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test import Client, TestCase

from apps.clientes.models import Cliente
from apps.facturacion.models import Factura
from apps.servicios.history import registrar_creacion
from apps.servicios.models import HistorialSolicitud, SolicitudServicio
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Usuario

from .models import Garantia, ReingresoGarantia
from .services import crear_garantia, crear_reingreso


class GarantiasBackendTests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser(
            "admin_garantias",
            "admin.garantias@test.local",
            "AdminGarantias123!",
        )
        self.admin.rol = Usuario.Rol.ADMIN
        self.admin.activo = True
        self.admin.first_name = "Ana"
        self.admin.last_name = "Admin"
        self.admin.save(update_fields=["rol", "activo", "first_name", "last_name"])

        self.cliente_usuario = Usuario.objects.create_user(
            "cliente_garantias",
            password="ClienteGarantias123!",
            email="cliente.garantias@test.local",
            first_name="Carla",
            last_name="Cliente",
            rol=Usuario.Rol.CLIENTE,
        )
        self.cliente = Cliente.objects.create(usuario=self.cliente_usuario)
        self.tecnico_usuario = Usuario.objects.create_user(
            "tecnico_garantias",
            password="TecnicoGarantias123!",
            email="tecnico.garantias@test.local",
            first_name="Tomas",
            last_name="Tecnico",
            rol=Usuario.Rol.TECNICO,
        )
        self.tecnico = Tecnico.objects.create(
            usuario=self.tecnico_usuario,
            especialidad="Diagnostico",
        )
        self.orden = SolicitudServicio.objects.create(
            cliente=self.cliente,
            tecnico=self.tecnico,
            dispositivo="Laptop de garantia",
            problema="Falla de encendido",
            fecha_preferida=date.today(),
            prioridad=SolicitudServicio.Prioridad.ALTA,
            estado=SolicitudServicio.Estado.COMPLETADO,
            diagnostico="Equipo reparado y probado correctamente.",
        )
        registrar_creacion(self.orden, self.cliente_usuario)

        self.admin_client = Client()
        self.admin_client.force_login(self.admin)
        self.cliente_client = Client()
        self.cliente_client.force_login(self.cliente_usuario)
        self.tecnico_client = Client()
        self.tecnico_client.force_login(self.tecnico_usuario)

    def post_json(self, cliente, ruta, datos):
        return cliente.post(
            ruta,
            data=json.dumps(datos),
            content_type="application/json",
        )

    def crear_por_api(self, **cambios):
        datos = {
            "solicitudId": self.orden.id,
            "duracionDias": 30,
            "condicionesPublicas": "Cubre la misma falla reparada.",
            "notasInternas": "Revisar sello del taller.",
        }
        datos.update(cambios)
        return self.post_json(self.admin_client, "/garantias/crear/", datos)

    def garantia_vigente(self):
        return crear_garantia(
            self.orden.id,
            30,
            self.admin,
            "Cubre la misma falla reparada.",
            "Nota exclusiva del taller.",
        )

    @patch("apps.garantias.services.timezone.localdate", return_value=date(2026, 9, 12))
    def test_creacion_calcula_fechas_en_backend_y_registra_historial(self, _fecha):
        respuesta = self.crear_por_api(
            fechaInicio="2000-01-01",
            fechaVencimiento="2099-12-31",
        )

        self.assertEqual(respuesta.status_code, 201)
        garantia = Garantia.objects.get()
        self.assertEqual(garantia.fecha_inicio, date(2026, 9, 12))
        self.assertEqual(garantia.fecha_vencimiento, date(2026, 10, 12))
        self.assertEqual(garantia.estado_actual, Garantia.Estado.VIGENTE)
        self.assertEqual(garantia.creada_por, self.admin)
        self.assertEqual(garantia.creada_por_username, "admin_garantias")
        self.assertEqual(garantia.creada_por_nombre, "Ana Admin")
        evento = HistorialSolicitud.objects.get(
            solicitud=self.orden,
            accion=HistorialSolicitud.TipoEvento.GARANTIA_ACTIVADA,
        )
        self.assertEqual(evento.visibilidad, HistorialSolicitud.Visibilidad.PUBLICO)
        self.assertEqual(evento.usuario, self.admin)
        historial_cliente = self.cliente_client.get(
            f"/servicios/{self.orden.id}/historial/"
        ).json()["historial"]
        self.assertIn(
            HistorialSolicitud.TipoEvento.GARANTIA_ACTIVADA,
            [item["accion"] for item in historial_cliente],
        )

    def test_rechaza_orden_no_completada(self):
        self.orden.estado = SolicitudServicio.Estado.EN_PROCESO
        self.orden.save(update_fields=["estado"])

        respuesta = self.crear_por_api()

        self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(Garantia.objects.exists())

    def test_rechaza_duraciones_invalidas(self):
        for duracion in [0, -1, "abc", True, 30.5, 32768]:
            with self.subTest(duracion=duracion):
                respuesta = self.crear_por_api(duracionDias=duracion)
                self.assertEqual(respuesta.status_code, 400)
                self.assertFalse(Garantia.objects.exists())

    def test_solo_admite_una_garantia_por_orden(self):
        self.assertEqual(self.crear_por_api().status_code, 201)

        respuesta = self.crear_por_api()

        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(Garantia.objects.count(), 1)

    def test_estado_vencido_se_calcula_sin_actualizar_la_base(self):
        garantia = self.garantia_vigente()
        futuro = garantia.fecha_vencimiento + timedelta(days=1)

        with patch("apps.garantias.models.timezone.localdate", return_value=futuro):
            self.assertEqual(garantia.estado_actual, Garantia.Estado.VENCIDA)
            self.assertEqual(garantia.dias_restantes, 0)

    def test_escrituras_requieren_administrador(self):
        datos = {"solicitudId": self.orden.id, "duracionDias": 30}
        self.assertEqual(
            self.post_json(Client(), "/garantias/crear/", datos).status_code,
            401,
        )
        self.assertEqual(
            self.post_json(self.cliente_client, "/garantias/crear/", datos).status_code,
            403,
        )
        self.assertEqual(
            self.post_json(self.tecnico_client, "/garantias/crear/", datos).status_code,
            403,
        )

        garantia = self.garantia_vigente()
        ruta_reingreso = f"/garantias/{garantia.id}/reingreso/"
        ruta_anular = f"/garantias/{garantia.id}/anular/"
        self.assertEqual(
            self.post_json(self.cliente_client, ruta_reingreso, {"motivo": "Falla"}).status_code,
            403,
        )
        self.assertEqual(
            self.post_json(self.tecnico_client, ruta_anular, {"motivo": "Error"}).status_code,
            403,
        )

    def test_reingreso_crea_orden_nueva_sin_alterar_original_ni_factura(self):
        garantia = self.garantia_vigente()
        factura = Factura.objects.create(
            solicitud=self.orden,
            servicio_monto=Decimal("50.00"),
            total=Decimal("50.00"),
            garantia="30 Días",
        )
        self.orden.refresh_from_db()
        original_antes = {
            "estado": self.orden.estado,
            "tecnico_id": self.orden.tecnico_id,
            "diagnostico": self.orden.diagnostico,
            "actualizado_en": self.orden.actualizado_en,
        }
        eventos_anteriores = set(self.orden.historial.values_list("id", flat=True))

        respuesta = self.post_json(
            self.admin_client,
            f"/garantias/{garantia.id}/reingreso/",
            {
                "motivo": "La misma falla volvió a presentarse.",
                "observacionesInternas": "Validar el componente reemplazado.",
                "estado": "completado",
                "tecnico": self.tecnico.id,
                "monto": 999,
            },
        )

        self.assertEqual(respuesta.status_code, 201)
        reingreso = ReingresoGarantia.objects.select_related("solicitud_reingreso").get()
        nueva = reingreso.solicitud_reingreso
        self.assertNotEqual(nueva.id, self.orden.id)
        self.assertEqual(nueva.estado, SolicitudServicio.Estado.PENDIENTE)
        self.assertIsNone(nueva.tecnico)
        self.assertEqual(nueva.cliente, self.cliente)
        self.assertEqual(nueva.dispositivo, self.orden.dispositivo)
        self.assertEqual(nueva.prioridad, self.orden.prioridad)

        self.orden.refresh_from_db()
        self.assertEqual(self.orden.estado, original_antes["estado"])
        self.assertEqual(self.orden.tecnico_id, original_antes["tecnico_id"])
        self.assertEqual(self.orden.diagnostico, original_antes["diagnostico"])
        self.assertEqual(self.orden.actualizado_en, original_antes["actualizado_en"])
        self.assertTrue(eventos_anteriores.issubset(
            set(self.orden.historial.values_list("id", flat=True))
        ))
        factura.refresh_from_db()
        self.assertEqual(factura.total, Decimal("50.00"))
        self.assertEqual(factura.garantia, "30 Días")
        self.assertEqual(garantia.estado_actual, Garantia.Estado.UTILIZADA)
        self.assertEqual(
            list(nueva.historial.values_list("accion", flat=True)),
            [
                HistorialSolicitud.TipoEvento.CREACION,
                HistorialSolicitud.TipoEvento.GARANTIA_UTILIZADA,
            ],
        )

    def test_bloquea_un_segundo_reingreso(self):
        garantia = self.garantia_vigente()
        crear_reingreso(garantia.id, self.admin, "Primera devolución")
        total_ordenes = SolicitudServicio.objects.count()

        respuesta = self.post_json(
            self.admin_client,
            f"/garantias/{garantia.id}/reingreso/",
            {"motivo": "Segundo intento"},
        )

        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(ReingresoGarantia.objects.count(), 1)
        self.assertEqual(SolicitudServicio.objects.count(), total_ordenes)

    def test_reingreso_bloquea_la_fila_de_garantia(self):
        garantia = self.garantia_vigente()
        consultas = []

        def capturar(execute, sql, params, many, context):
            consultas.append(sql)
            return execute(sql, params, many, context)

        with connection.execute_wrapper(capturar):
            crear_reingreso(garantia.id, self.admin, "Falla repetida")

        self.assertTrue(any(
            "garantias_garantia" in sql and "FOR UPDATE" in sql.upper()
            for sql in consultas
        ))

    def test_rechaza_reingreso_vencido(self):
        garantia = self.garantia_vigente()
        futuro = garantia.fecha_vencimiento + timedelta(days=1)

        with patch("apps.garantias.models.timezone.localdate", return_value=futuro):
            respuesta = self.post_json(
                self.admin_client,
                f"/garantias/{garantia.id}/reingreso/",
                {"motivo": "Falla fuera de plazo"},
            )

        self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(ReingresoGarantia.objects.exists())
        self.assertEqual(SolicitudServicio.objects.count(), 1)

    def test_anulacion_impide_reingreso_y_conserva_actor(self):
        garantia = self.garantia_vigente()

        respuesta = self.post_json(
            self.admin_client,
            f"/garantias/{garantia.id}/anular/",
            {"motivo": "Garantía registrada por error."},
        )

        self.assertEqual(respuesta.status_code, 200)
        garantia.refresh_from_db()
        self.assertEqual(garantia.estado_actual, Garantia.Estado.ANULADA)
        self.assertEqual(garantia.anulada_por, self.admin)
        self.assertEqual(garantia.anulada_por_username, "admin_garantias")
        self.assertTrue(self.orden.historial.filter(
            accion=HistorialSolicitud.TipoEvento.GARANTIA_ANULADA
        ).exists())
        reingreso = self.post_json(
            self.admin_client,
            f"/garantias/{garantia.id}/reingreso/",
            {"motivo": "Intento posterior"},
        )
        self.assertEqual(reingreso.status_code, 400)

    def test_no_anula_garantia_utilizada(self):
        garantia = self.garantia_vigente()
        crear_reingreso(garantia.id, self.admin, "Falla repetida")

        respuesta = self.post_json(
            self.admin_client,
            f"/garantias/{garantia.id}/anular/",
            {"motivo": "Intento inválido"},
        )

        self.assertEqual(respuesta.status_code, 400)
        garantia.refresh_from_db()
        self.assertIsNone(garantia.anulada_en)
        self.assertEqual(garantia.estado_actual, Garantia.Estado.UTILIZADA)

    def test_consulta_respeta_roles_y_oculta_datos_internos(self):
        garantia = self.garantia_vigente()
        reingreso = crear_reingreso(
            garantia.id,
            self.admin,
            "Falla repetida",
            "Observación privada del taller.",
        )

        respuesta_admin = self.admin_client.get(f"/garantias/solicitud/{self.orden.id}/")
        respuesta_tecnico = self.tecnico_client.get(f"/garantias/solicitud/{self.orden.id}/")
        respuesta_cliente = self.cliente_client.get(
            f"/garantias/solicitud/{reingreso.solicitud_reingreso_id}/"
        )

        self.assertEqual(respuesta_admin.status_code, 200)
        self.assertEqual(respuesta_tecnico.status_code, 200)
        self.assertEqual(respuesta_cliente.status_code, 200)
        garantia_admin = respuesta_admin.json()["garantia"]
        garantia_tecnico = respuesta_tecnico.json()["garantia"]
        self.assertIn("notasInternas", garantia_admin)
        self.assertIn("creadaPor", garantia_admin)
        self.assertIn("observacionesInternas", garantia_admin["reingreso"])
        self.assertIn("registradoPor", garantia_admin["reingreso"])

        for campo in ["notasInternas", "creadaPor", "motivoAnulacion", "anuladaPor"]:
            self.assertNotIn(campo, garantia_tecnico)
        self.assertNotIn("observacionesInternas", garantia_tecnico["reingreso"])
        self.assertNotIn("registradoPor", garantia_tecnico["reingreso"])
        self.assertEqual(garantia_tecnico["reingreso"]["motivo"], "Falla repetida")

        garantia_cliente = respuesta_cliente.json()["garantia"]
        self.assertNotIn("notasInternas", garantia_cliente)
        self.assertNotIn("creadaPor", garantia_cliente)
        self.assertNotIn("observacionesInternas", garantia_cliente["reingreso"])
        self.assertEqual(garantia_cliente["reingreso"]["motivo"], "Falla repetida")

        otro_usuario = Usuario.objects.create_user(
            "cliente_garantia_ajeno",
            password="ClienteAjeno123!",
            rol=Usuario.Rol.CLIENTE,
        )
        Cliente.objects.create(usuario=otro_usuario)
        otro_cliente = Client()
        otro_cliente.force_login(otro_usuario)
        self.assertEqual(
            otro_cliente.get(f"/garantias/solicitud/{self.orden.id}/").status_code,
            403,
        )

    def test_tecnico_del_reingreso_puede_consultar_la_garantia(self):
        garantia = self.garantia_vigente()
        reingreso = crear_reingreso(garantia.id, self.admin, "Falla repetida")
        otro_usuario = Usuario.objects.create_user(
            "tecnico_reingreso",
            password="TecnicoReingreso123!",
            rol=Usuario.Rol.TECNICO,
        )
        otro_tecnico = Tecnico.objects.create(usuario=otro_usuario, especialidad="Garantias")
        nueva = reingreso.solicitud_reingreso
        nueva.tecnico = otro_tecnico
        nueva.save(update_fields=["tecnico"])
        cliente = Client()
        cliente.force_login(otro_usuario)

        respuesta = cliente.get(f"/garantias/solicitud/{nueva.id}/")

        self.assertEqual(respuesta.status_code, 200)
        datos = respuesta.json()["garantia"]
        self.assertNotIn("notasInternas", datos)
        self.assertNotIn("creadaPor", datos)
        self.assertNotIn("observacionesInternas", datos["reingreso"])
        self.assertEqual(datos["reingreso"]["motivo"], "Falla repetida")

    def test_cliente_recibe_null_si_su_orden_no_tiene_garantia(self):
        respuesta = self.cliente_client.get(f"/garantias/solicitud/{self.orden.id}/")

        self.assertEqual(respuesta.status_code, 200)
        self.assertIsNone(respuesta.json()["garantia"])

    def test_identidad_se_conserva_si_el_actor_es_eliminado(self):
        actor = Usuario.objects.create_user(
            "admin_garantia_temporal",
            password="AdminTemporal123!",
            first_name="Ada",
            last_name="Temporal",
            rol=Usuario.Rol.ADMIN,
        )
        garantia = crear_garantia(self.orden.id, 30, actor)
        reingreso = crear_reingreso(garantia.id, actor, "Falla repetida")

        actor.delete()
        garantia.refresh_from_db()
        reingreso.refresh_from_db()

        self.assertIsNone(garantia.creada_por)
        self.assertEqual(garantia.creada_por_username, "admin_garantia_temporal")
        self.assertEqual(garantia.creada_por_nombre, "Ada Temporal")
        self.assertEqual(garantia.creada_por_rol, Usuario.Rol.ADMIN)
        self.assertIsNone(reingreso.registrado_por)
        self.assertEqual(reingreso.registrado_por_username, "admin_garantia_temporal")
        self.assertEqual(reingreso.registrado_por_nombre, "Ada Temporal")
        evento = HistorialSolicitud.objects.filter(
            accion=HistorialSolicitud.TipoEvento.GARANTIA_UTILIZADA,
            solicitud=self.orden,
        ).get()
        self.assertIsNone(evento.usuario)
        self.assertEqual(evento.usuario_username, "admin_garantia_temporal")

    def test_no_elimina_orden_original_ni_reingreso(self):
        garantia = self.garantia_vigente()
        reingreso = crear_reingreso(garantia.id, self.admin, "Falla repetida")

        original = self.admin_client.post(f"/servicios/{self.orden.id}/eliminar/")
        nueva = self.admin_client.post(
            f"/servicios/{reingreso.solicitud_reingreso_id}/eliminar/"
        )

        self.assertEqual(original.status_code, 400)
        self.assertEqual(nueva.status_code, 400)
        self.assertTrue(SolicitudServicio.objects.filter(pk=self.orden.id).exists())
        self.assertTrue(SolicitudServicio.objects.filter(
            pk=reingreso.solicitud_reingreso_id
        ).exists())
