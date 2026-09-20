import json
from datetime import date
from unittest import mock

from django.contrib import admin as django_admin
from django.db import IntegrityError, connection, transaction
from django.test import Client, RequestFactory, TestCase
from django.test.utils import CaptureQueriesContext

from apps.clientes.models import Cliente
from apps.facturacion.models import Factura
from apps.garantias.services import crear_garantia, crear_reingreso
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Notificacion, RegistroAuditoria, Usuario
from .history import registrar_asignacion, registrar_creacion, registrar_diagnostico
from .models import HistorialSolicitud, SolicitudServicio
from .views import (
    actualizar_solicitud,
    crear_solicitud,
    queryset_por_rol,
    serializar_solicitud,
)


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

    def actualizar_como_admin(
        self,
        solicitud,
        tecnico="",
        estado="Pendiente",
        actualizado_en=None,
        **cambios,
    ):
        if actualizado_en is None:
            solicitud.refresh_from_db()
            actualizado_en = solicitud.actualizado_en.isoformat()
        datos = self.datos_actualizacion_admin(
            solicitud,
            tecnico=tecnico,
            estado=estado,
            actualizado_en=actualizado_en,
            **cambios,
        )
        return self.admin_client.post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps(datos),
            content_type="application/json",
        )

    def datos_actualizacion_admin(
        self,
        solicitud,
        tecnico="",
        estado="Pendiente",
        actualizado_en=None,
        **cambios,
    ):
        datos = {
            "clienteId": str(self.cliente.id),
            "cliente": "Cliente Prueba",
            "dispositivo": solicitud.dispositivo,
            "servicio": solicitud.problema,
            "fecha": date.today().isoformat(),
            "tecnico": tecnico,
            "prioridad": "Alta",
            "estado": estado,
            "actualizadoEn": actualizado_en or solicitud.actualizado_en.isoformat(),
        }
        datos.update(cambios)
        return datos

    def actualizar_como_tecnico(
        self,
        solicitud,
        estado,
        diagnostico="",
        repuesto="",
        actualizado_en=None,
    ):
        if actualizado_en is None:
            solicitud.refresh_from_db()
            actualizado_en = solicitud.actualizado_en.isoformat()
        return self.tecnico_client.post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps({
                "diagnostico": diagnostico,
                "repuesto": repuesto,
                "estado": estado,
                "actualizadoEn": actualizado_en,
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
                "actualizadoEn": solicitud.actualizado_en.isoformat(),
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
                "actualizadoEn": solicitud.actualizado_en.isoformat(),
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta_inicio.status_code, 200)
        solicitud.refresh_from_db()
        respuesta = tecnico_client.post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps({
                "diagnostico": "Se reviso el equipo y se reparo correctamente.",
                "repuesto": "Sin repuesto",
                "estado": "Completado",
                "actualizadoEn": solicitud.actualizado_en.isoformat(),
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

        self.assertEqual(respuesta.status_code, 409)
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

    def test_orden_cancelada_no_puede_reabrirse(self):
        solicitud = self.crear_orden(estado=SolicitudServicio.Estado.CANCELADO)

        respuesta = self.actualizar_como_admin(solicitud, estado="Pendiente")

        self.assertEqual(respuesta.status_code, 409)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.CANCELADO)
        self.assertFalse(HistorialSolicitud.objects.filter(solicitud=solicitud).exists())

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

    def test_cancelacion_desde_en_proceso_es_valida(self):
        solicitud = self.crear_orden(
            tecnico=self.tecnico,
            estado=SolicitudServicio.Estado.EN_PROCESO,
        )

        respuesta = self.actualizar_como_admin(
            solicitud,
            tecnico=self.tecnico_usuario.username,
            estado="Cancelado",
        )

        self.assertEqual(respuesta.status_code, 200)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.CANCELADO)
        self.assertTrue(
            HistorialSolicitud.objects.filter(
                solicitud=solicitud,
                accion=HistorialSolicitud.TipoEvento.CANCELACION,
            ).exists()
        )

    def test_estado_desconocido_se_rechaza(self):
        solicitud = self.crear_orden()

        respuesta = self.actualizar_como_admin(
            solicitud,
            estado="estado_inexistente",
        )

        self.assertEqual(respuesta.status_code, 400)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.PENDIENTE)

    def test_orden_nueva_no_puede_iniciar_en_otro_estado(self):
        respuesta = self.admin_client.post(
            "/servicios/crear/",
            data=json.dumps({
                "clienteId": self.cliente.id,
                "cliente": self.cliente_usuario.username,
                "dispositivo": "Equipo nuevo",
                "servicio": "Diagnóstico inicial",
                "fecha": date.today().isoformat(),
                "estado": "En Proceso",
            }),
            content_type="application/json",
        )

        self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(SolicitudServicio.objects.exists())

    def test_admin_no_puede_iniciar_sin_tecnico(self):
        solicitud = self.crear_orden()

        respuesta = self.actualizar_como_admin(
            solicitud,
            estado="En Proceso",
        )

        self.assertEqual(respuesta.status_code, 400)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.PENDIENTE)

    def test_no_puede_finalizar_sin_diagnostico_valido(self):
        solicitud = self.crear_orden(
            tecnico=self.tecnico,
            estado=SolicitudServicio.Estado.EN_PROCESO,
        )

        respuesta = self.actualizar_como_admin(
            solicitud,
            tecnico=self.tecnico_usuario.username,
            estado="Completado",
        )

        self.assertEqual(respuesta.status_code, 400)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.EN_PROCESO)

    def test_tecnico_no_puede_cancelar_con_peticion_manipulada(self):
        solicitud = self.crear_orden(tecnico=self.tecnico)

        respuesta = self.actualizar_como_tecnico(solicitud, "Cancelado")

        self.assertEqual(respuesta.status_code, 403)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.PENDIENTE)

    def test_todas_las_transiciones_invalidas_se_rechazan(self):
        nombres = {
            SolicitudServicio.Estado.PENDIENTE: "Pendiente",
            SolicitudServicio.Estado.EN_PROCESO: "En Proceso",
            SolicitudServicio.Estado.COMPLETADO: "Completado",
            SolicitudServicio.Estado.CANCELADO: "Cancelado",
        }
        casos = [
            (SolicitudServicio.Estado.PENDIENTE, SolicitudServicio.Estado.COMPLETADO),
            (SolicitudServicio.Estado.EN_PROCESO, SolicitudServicio.Estado.PENDIENTE),
            (SolicitudServicio.Estado.COMPLETADO, SolicitudServicio.Estado.PENDIENTE),
            (SolicitudServicio.Estado.COMPLETADO, SolicitudServicio.Estado.EN_PROCESO),
            (SolicitudServicio.Estado.COMPLETADO, SolicitudServicio.Estado.CANCELADO),
            (SolicitudServicio.Estado.CANCELADO, SolicitudServicio.Estado.PENDIENTE),
            (SolicitudServicio.Estado.CANCELADO, SolicitudServicio.Estado.EN_PROCESO),
            (SolicitudServicio.Estado.CANCELADO, SolicitudServicio.Estado.COMPLETADO),
        ]

        for indice, (origen, destino) in enumerate(casos):
            with self.subTest(origen=origen, destino=destino):
                solicitud = SolicitudServicio.objects.create(
                    cliente=self.cliente,
                    tecnico=self.tecnico,
                    dispositivo=f"Equipo transición {indice}",
                    problema="Prueba de transición",
                    fecha_preferida=date.today(),
                    prioridad=SolicitudServicio.Prioridad.ALTA,
                    estado=origen,
                    diagnostico="Diagnóstico suficientemente detallado.",
                )
                respuesta = self.actualizar_como_admin(
                    solicitud,
                    tecnico=self.tecnico_usuario.username,
                    estado=nombres[destino],
                )

                self.assertEqual(respuesta.status_code, 409)
                solicitud.refresh_from_db()
                self.assertEqual(solicitud.estado, origen)
                self.assertFalse(
                    HistorialSolicitud.objects.filter(solicitud=solicitud).exists()
                )

    def test_datos_principales_no_cambian_durante_trabajo(self):
        solicitud = self.crear_orden(
            tecnico=self.tecnico,
            estado=SolicitudServicio.Estado.EN_PROCESO,
        )

        respuesta = self.actualizar_como_admin(
            solicitud,
            tecnico=self.tecnico_usuario.username,
            estado="En Proceso",
            dispositivo="Otro dispositivo",
        )

        self.assertEqual(respuesta.status_code, 409)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.dispositivo, "Laptop de prueba")

    def test_en_proceso_permite_prioridad_y_reasignacion(self):
        otro_usuario = Usuario.objects.create_user(
            username="tecnico_reasignado",
            password="TecnicoReasignado123!",
            email="tecnico.reasignado@test.local",
            rol=Usuario.Rol.TECNICO,
        )
        otro_tecnico = Tecnico.objects.create(
            usuario=otro_usuario,
            especialidad="Electrónica",
        )
        solicitud = self.crear_orden(
            tecnico=self.tecnico,
            estado=SolicitudServicio.Estado.EN_PROCESO,
        )

        respuesta = self.actualizar_como_admin(
            solicitud,
            tecnico=otro_usuario.username,
            estado="En Proceso",
            prioridad="Baja",
        )

        self.assertEqual(respuesta.status_code, 200)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.tecnico, otro_tecnico)
        self.assertEqual(solicitud.prioridad, SolicitudServicio.Prioridad.BAJA)

    def test_version_faltante_y_version_obsoleta_se_rechazan(self):
        solicitud = self.crear_orden()
        datos = self.datos_actualizacion_admin(solicitud)
        datos.pop("actualizadoEn")

        sin_version = self.admin_client.post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps(datos),
            content_type="application/json",
        )
        version_original = solicitud.actualizado_en.isoformat()
        primera = self.actualizar_como_admin(
            solicitud,
            tecnico=self.tecnico_usuario.username,
        )
        obsoleta = self.actualizar_como_admin(
            solicitud,
            tecnico="",
            actualizado_en=version_original,
        )

        self.assertEqual(sin_version.status_code, 400)
        self.assertEqual(primera.status_code, 200)
        self.assertEqual(obsoleta.status_code, 409)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.tecnico, self.tecnico)

    def test_orden_facturada_es_inmutable(self):
        solicitud = self.crear_orden(
            tecnico=self.tecnico,
            estado=SolicitudServicio.Estado.COMPLETADO,
        )
        Factura.objects.create(solicitud=solicitud, total="50.00")

        respuesta = self.actualizar_como_admin(
            solicitud,
            tecnico=self.tecnico_usuario.username,
            estado="Completado",
        )

        self.assertEqual(respuesta.status_code, 409)
        self.assertIn("facturada", respuesta.json()["error"])

    def test_orden_original_con_garantia_es_inmutable(self):
        solicitud = self.crear_orden(
            tecnico=self.tecnico,
            estado=SolicitudServicio.Estado.COMPLETADO,
        )
        crear_garantia(solicitud.id, 30, self.admin)

        respuesta = self.actualizar_como_admin(
            solicitud,
            tecnico=self.tecnico_usuario.username,
            estado="Completado",
        )

        self.assertEqual(respuesta.status_code, 409)
        self.assertIn("garantía", respuesta.json()["error"])

    def test_reingreso_sigue_el_flujo_normal_sin_reabrir_original(self):
        original = self.crear_orden(
            tecnico=self.tecnico,
            estado=SolicitudServicio.Estado.COMPLETADO,
        )
        Factura.objects.create(solicitud=original, total="75.00")
        garantia = crear_garantia(original.id, 30, self.admin)
        reingreso = crear_reingreso(
            garantia.id,
            self.admin,
            "La falla volvió a presentarse.",
        ).solicitud_reingreso

        asignacion = self.actualizar_como_admin(
            reingreso,
            tecnico=self.tecnico_usuario.username,
            estado="Pendiente",
        )
        inicio = self.actualizar_como_tecnico(reingreso, "En Proceso")
        finalizacion = self.actualizar_como_tecnico(
            reingreso,
            "Completado",
            diagnostico="Se corrigió nuevamente la conexión defectuosa.",
            repuesto="Sin repuesto",
        )

        self.assertEqual(asignacion.status_code, 200)
        self.assertEqual(inicio.status_code, 200)
        self.assertEqual(finalizacion.status_code, 200)
        original.refresh_from_db()
        reingreso.refresh_from_db()
        self.assertEqual(original.estado, SolicitudServicio.Estado.COMPLETADO)
        self.assertEqual(reingreso.estado, SolicitudServicio.Estado.COMPLETADO)
        self.assertTrue(Factura.objects.filter(solicitud=original).exists())
        self.assertFalse(Factura.objects.filter(solicitud=reingreso).exists())

    def test_fallo_de_historial_revierte_la_actualizacion(self):
        solicitud = self.crear_orden(tecnico=self.tecnico)
        request = RequestFactory().post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps(self.datos_actualizacion_admin(
                solicitud,
                tecnico=self.tecnico_usuario.username,
                estado="En Proceso",
            )),
            content_type="application/json",
        )
        request.user = self.admin

        with mock.patch(
            "apps.servicios.views.registrar_inicio",
            side_effect=RuntimeError("fallo de historial"),
        ):
            with self.assertRaises(RuntimeError):
                actualizar_solicitud(request, solicitud.id)

        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.PENDIENTE)
        self.assertFalse(HistorialSolicitud.objects.filter(solicitud=solicitud).exists())
        self.assertFalse(RegistroAuditoria.objects.filter(objeto_id=str(solicitud.id)).exists())

    def test_fallo_de_auditoria_revierte_orden_e_historial(self):
        solicitud = self.crear_orden()
        request = RequestFactory().post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps(self.datos_actualizacion_admin(
                solicitud,
                estado="Cancelado",
            )),
            content_type="application/json",
        )
        request.user = self.admin

        with mock.patch(
            "apps.servicios.views.registrar_auditoria",
            side_effect=RuntimeError("fallo de auditoría"),
        ):
            with self.assertRaises(RuntimeError):
                actualizar_solicitud(request, solicitud.id)

        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.PENDIENTE)
        self.assertFalse(HistorialSolicitud.objects.filter(solicitud=solicitud).exists())
        self.assertFalse(RegistroAuditoria.objects.filter(objeto_id=str(solicitud.id)).exists())

    def test_fallo_de_notificacion_revierte_todos_los_cambios(self):
        solicitud = self.crear_orden()
        request = RequestFactory().post(
            f"/servicios/{solicitud.id}/actualizar/",
            data=json.dumps(self.datos_actualizacion_admin(
                solicitud,
                estado="Cancelado",
            )),
            content_type="application/json",
        )
        request.user = self.admin

        with mock.patch(
            "apps.servicios.views.notificar_usuarios",
            side_effect=RuntimeError("fallo de notificación"),
        ):
            with self.assertRaises(RuntimeError):
                actualizar_solicitud(request, solicitud.id)

        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.PENDIENTE)
        self.assertFalse(HistorialSolicitud.objects.filter(solicitud=solicitud).exists())
        self.assertFalse(RegistroAuditoria.objects.filter(objeto_id=str(solicitud.id)).exists())
        self.assertFalse(Notificacion.objects.filter(usuario=self.cliente_usuario).exists())

    def test_fallo_de_historial_revierte_la_creacion(self):
        request = RequestFactory().post(
            "/servicios/crear/",
            data=json.dumps({
                "clienteId": self.cliente.id,
                "cliente": self.cliente_usuario.username,
                "dispositivo": "Equipo atómico",
                "servicio": "Prueba de rollback",
                "fecha": date.today().isoformat(),
                "estado": "Pendiente",
            }),
            content_type="application/json",
        )
        request.user = self.admin

        with mock.patch(
            "apps.servicios.views.registrar_creacion",
            side_effect=RuntimeError("fallo de historial"),
        ):
            with self.assertRaises(RuntimeError):
                crear_solicitud(request)

        self.assertFalse(SolicitudServicio.objects.exists())
        self.assertFalse(HistorialSolicitud.objects.exists())

    def test_actualizacion_bloquea_la_fila_de_la_orden(self):
        solicitud = self.crear_orden()

        with CaptureQueriesContext(connection) as consultas:
            respuesta = self.actualizar_como_admin(
                solicitud,
                tecnico=self.tecnico_usuario.username,
            )

        self.assertEqual(respuesta.status_code, 200)
        consultas_bloqueo = [
            consulta["sql"]
            for consulta in consultas.captured_queries
            if "FOR UPDATE" in consulta["sql"].upper()
            and "servicios_solicitudservicio" in consulta["sql"]
        ]
        self.assertTrue(consultas_bloqueo)

    def test_base_de_datos_rechaza_estado_desconocido(self):
        solicitud = self.crear_orden()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                SolicitudServicio.objects.filter(pk=solicitud.pk).update(
                    estado="estado_inexistente"
                )

        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudServicio.Estado.PENDIENTE)

    def test_django_admin_es_de_solo_lectura(self):
        solicitud = self.crear_orden()
        model_admin = django_admin.site._registry[SolicitudServicio]
        request = RequestFactory().get(
            f"/admin/servicios/solicitudservicio/{solicitud.id}/change/"
        )
        request.user = self.admin

        self.assertFalse(model_admin.has_add_permission(request))
        self.assertFalse(model_admin.has_change_permission(request, solicitud))
        self.assertFalse(model_admin.has_delete_permission(request, solicitud))

        respuesta = self.admin_client.post(
            f"/admin/servicios/solicitudservicio/{solicitud.id}/change/",
            data={
                "dispositivo": "Modificado fuera del flujo",
                "problema": solicitud.problema,
                "prioridad": solicitud.prioridad,
                "estado": solicitud.estado,
            },
        )
        self.assertEqual(respuesta.status_code, 403)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.dispositivo, "Laptop de prueba")

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
