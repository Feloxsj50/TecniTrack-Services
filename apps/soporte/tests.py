import json

from django.test import Client, TestCase

from apps.usuarios.models import Usuario
from .models import TicketSoporte


class SoporteTests(TestCase):
    def setUp(self):
        self.usuario = Usuario.objects.create_user(
            "cliente_soporte", password="ClienteSoporte123!", rol=Usuario.Rol.CLIENTE,
            email="cliente.soporte@test.local", first_name="Cliente", last_name="Soporte",
        )
        self.admin = Usuario.objects.create_superuser("admin_soporte", "admin.soporte@test.local", "AdminSoporte123!")
        self.admin.rol = Usuario.Rol.ADMIN
        self.admin.activo = True
        self.admin.save(update_fields=["rol", "activo"])

    def test_cliente_crea_ticket_y_admin_responde(self):
        cliente = Client()
        cliente.login(username="cliente_soporte", password="ClienteSoporte123!")
        respuesta = cliente.post(
            "/soporte/crear/",
            data=json.dumps({
                "nombre": "Cliente Soporte", "correo": "cliente.soporte@test.local",
                "asunto": "Consulta de servicio", "area": "Sistema",
                "detalle": "Necesito consultar el estado de mi reparacion.",
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 201)
        ticket = TicketSoporte.objects.get()

        admin = Client()
        admin.login(username="admin_soporte", password="AdminSoporte123!")
        respuesta = admin.post(
            f"/soporte/{ticket.id}/responder/",
            data=json.dumps({"respuesta": "Tu solicitud fue atendida correctamente."}),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.estado, TicketSoporte.Estado.RESPONDIDO)
