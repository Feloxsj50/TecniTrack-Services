import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier

from django.db import close_old_connections
from django.test import Client, TransactionTestCase

from apps.clientes.models import Cliente
from apps.facturacion.models import Factura
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Usuario

from .models import HistorialSolicitud, SolicitudServicio


class CicloVidaOrdenesConcurrenciaTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.admin_password = "AdminOrdenConcurrente123!"
        self.admin = Usuario.objects.create_user(
            username="admin_orden_concurrente",
            password=self.admin_password,
            email="admin.orden.concurrente@test.local",
            rol=Usuario.Rol.ADMIN,
            activo=True,
        )
        cliente_usuario = Usuario.objects.create_user(
            username="cliente_orden_concurrente",
            password="ClienteOrdenConcurrente123!",
            email="cliente.orden.concurrente@test.local",
            rol=Usuario.Rol.CLIENTE,
            activo=True,
        )
        self.cliente = Cliente.objects.create(usuario=cliente_usuario)

        self.tecnico_password = "TecnicoOrdenConcurrente123!"
        self.tecnico_usuario = Usuario.objects.create_user(
            username="tecnico_orden_concurrente",
            password=self.tecnico_password,
            email="tecnico.orden.concurrente@test.local",
            rol=Usuario.Rol.TECNICO,
            activo=True,
        )
        self.tecnico = Tecnico.objects.create(
            usuario=self.tecnico_usuario,
            especialidad="Reparación",
        )
        self.otro_tecnico_usuario = Usuario.objects.create_user(
            username="tecnico_orden_reasignado",
            password="TecnicoOrdenReasignado123!",
            email="tecnico.orden.reasignado@test.local",
            rol=Usuario.Rol.TECNICO,
            activo=True,
        )
        self.otro_tecnico = Tecnico.objects.create(
            usuario=self.otro_tecnico_usuario,
            especialidad="Electrónica",
        )

    def crear_orden(self, estado=SolicitudServicio.Estado.PENDIENTE):
        return SolicitudServicio.objects.create(
            cliente=self.cliente,
            tecnico=self.tecnico,
            dispositivo="Laptop concurrente",
            problema="Falla concurrente",
            fecha_preferida=date.today(),
            prioridad=SolicitudServicio.Prioridad.MEDIA,
            estado=estado,
            diagnostico=(
                "Diagnóstico completo para finalizar la reparación."
                if estado == SolicitudServicio.Estado.EN_PROCESO
                else ""
            ),
        )

    def cliente_autenticado(self, username, password):
        cliente = Client()
        if not cliente.login(username=username, password=password):
            raise AssertionError("No se pudo iniciar la sesión de la prueba concurrente.")
        return cliente

    def datos_admin(self, orden, version, tecnico, prioridad="Media"):
        return {
            "clienteId": self.cliente.id,
            "cliente": self.cliente.usuario.username,
            "dispositivo": orden.dispositivo,
            "servicio": orden.problema,
            "fecha": orden.fecha_preferida.isoformat(),
            "tecnico": tecnico,
            "prioridad": prioridad,
            "estado": "Pendiente",
            "actualizadoEn": version,
        }

    def actualizar_admin_en_hilo(self, orden_id, datos, barrera):
        close_old_connections()
        try:
            cliente = self.cliente_autenticado(
                self.admin.username,
                self.admin_password,
            )
            barrera.wait(timeout=10)
            respuesta = cliente.post(
                f"/servicios/{orden_id}/actualizar/",
                data=json.dumps(datos),
                content_type="application/json",
            )
            return respuesta.status_code, respuesta.json()
        finally:
            close_old_connections()

    def iniciar_tecnico_en_hilo(self, orden_id, version, barrera):
        close_old_connections()
        try:
            cliente = self.cliente_autenticado(
                self.tecnico_usuario.username,
                self.tecnico_password,
            )
            barrera.wait(timeout=10)
            respuesta = cliente.post(
                f"/servicios/{orden_id}/actualizar/",
                data=json.dumps({
                    "diagnostico": "",
                    "repuesto": "",
                    "estado": "En Proceso",
                    "actualizadoEn": version,
                }),
                content_type="application/json",
            )
            return respuesta.status_code, respuesta.json()
        finally:
            close_old_connections()

    def finalizar_tecnico_en_hilo(self, orden_id, version, barrera):
        close_old_connections()
        try:
            cliente = self.cliente_autenticado(
                self.tecnico_usuario.username,
                self.tecnico_password,
            )
            barrera.wait(timeout=10)
            respuesta = cliente.post(
                f"/servicios/{orden_id}/actualizar/",
                data=json.dumps({
                    "diagnostico": "Diagnóstico completo para finalizar la reparación.",
                    "repuesto": "Sin repuesto",
                    "estado": "Completado",
                    "actualizadoEn": version,
                }),
                content_type="application/json",
            )
            return respuesta.status_code, respuesta.json()
        finally:
            close_old_connections()

    def facturar_en_hilo(self, orden_id, barrera):
        close_old_connections()
        try:
            cliente = self.cliente_autenticado(
                self.admin.username,
                self.admin_password,
            )
            barrera.wait(timeout=10)
            respuesta = cliente.post(
                "/facturacion/crear/",
                data=json.dumps({
                    "solicitudId": orden_id,
                    "montoServicio": "50.00",
                    "productos": [],
                    "metodoPago": "Efectivo",
                    "estado": "Pagado",
                }),
                content_type="application/json",
            )
            return respuesta.status_code, respuesta.json()
        finally:
            close_old_connections()

    def test_dos_actualizaciones_con_la_misma_version_no_se_sobrescriben(self):
        orden = self.crear_orden()
        version = orden.actualizado_en.isoformat()
        barrera = Barrier(2)
        operaciones = [
            self.datos_admin(
                orden,
                version,
                self.tecnico_usuario.username,
                prioridad="Alta",
            ),
            self.datos_admin(
                orden,
                version,
                self.tecnico_usuario.username,
                prioridad="Baja",
            ),
        ]

        with ThreadPoolExecutor(max_workers=2) as executor:
            futuros = [
                executor.submit(
                    self.actualizar_admin_en_hilo,
                    orden.id,
                    datos,
                    barrera,
                )
                for datos in operaciones
            ]
            resultados = [futuro.result(timeout=30) for futuro in futuros]

        self.assertEqual(sorted(estado for estado, _ in resultados), [200, 409])
        orden.refresh_from_db()
        self.assertIn(
            orden.prioridad,
            [SolicitudServicio.Prioridad.ALTA, SolicitudServicio.Prioridad.BAJA],
        )

    def test_reasignacion_y_actualizacion_del_tecnico_no_pierden_cambios(self):
        orden = self.crear_orden()
        version = orden.actualizado_en.isoformat()
        barrera = Barrier(2)
        datos_admin = self.datos_admin(
            orden,
            version,
            self.otro_tecnico_usuario.username,
        )

        with ThreadPoolExecutor(max_workers=2) as executor:
            futuro_admin = executor.submit(
                self.actualizar_admin_en_hilo,
                orden.id,
                datos_admin,
                barrera,
            )
            futuro_tecnico = executor.submit(
                self.iniciar_tecnico_en_hilo,
                orden.id,
                version,
                barrera,
            )
            resultado_admin = futuro_admin.result(timeout=30)
            resultado_tecnico = futuro_tecnico.result(timeout=30)

        self.assertIn(resultado_admin[0], [200, 409])
        self.assertIn(resultado_tecnico[0], [200, 403, 409])
        self.assertEqual(
            sum(resultado[0] == 200 for resultado in [resultado_admin, resultado_tecnico]),
            1,
        )

        orden.refresh_from_db()
        if orden.estado == SolicitudServicio.Estado.EN_PROCESO:
            self.assertEqual(orden.tecnico, self.tecnico)
            self.assertTrue(
                HistorialSolicitud.objects.filter(
                    solicitud=orden,
                    accion=HistorialSolicitud.TipoEvento.INICIO,
                ).exists()
            )
        else:
            self.assertEqual(orden.estado, SolicitudServicio.Estado.PENDIENTE)
            self.assertEqual(orden.tecnico, self.otro_tecnico)
            self.assertTrue(
                HistorialSolicitud.objects.filter(
                    solicitud=orden,
                    accion=HistorialSolicitud.TipoEvento.ASIGNACION,
                ).exists()
            )

    def test_finalizacion_y_facturacion_quedan_serializadas(self):
        orden = self.crear_orden(estado=SolicitudServicio.Estado.EN_PROCESO)
        version = orden.actualizado_en.isoformat()
        barrera = Barrier(2)

        with ThreadPoolExecutor(max_workers=2) as executor:
            futuro_finalizar = executor.submit(
                self.finalizar_tecnico_en_hilo,
                orden.id,
                version,
                barrera,
            )
            futuro_facturar = executor.submit(
                self.facturar_en_hilo,
                orden.id,
                barrera,
            )
            resultado_finalizar = futuro_finalizar.result(timeout=30)
            resultado_facturar = futuro_facturar.result(timeout=30)

        self.assertEqual(resultado_finalizar[0], 200)
        self.assertIn(resultado_facturar[0], [201, 400])
        orden.refresh_from_db()
        self.assertEqual(orden.estado, SolicitudServicio.Estado.COMPLETADO)
        self.assertEqual(
            Factura.objects.filter(solicitud=orden).count(),
            1 if resultado_facturar[0] == 201 else 0,
        )
        self.assertEqual(
            HistorialSolicitud.objects.filter(
                solicitud=orden,
                accion=HistorialSolicitud.TipoEvento.FINALIZACION,
            ).count(),
            1,
        )
