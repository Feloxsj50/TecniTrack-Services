import json
from datetime import date

from django.test import Client, TestCase

from apps.clientes.models import Cliente
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Notificacion, Usuario
from .models import HistorialSolicitud, SolicitudServicio


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
                "estado": "En proceso",
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 200)

        tecnico_client = Client()
        self.assertTrue(tecnico_client.login(username="tecnico_test", password="TecnicoTest123!"))
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
        self.assertGreaterEqual(HistorialSolicitud.objects.filter(solicitud=solicitud).count(), 2)

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
