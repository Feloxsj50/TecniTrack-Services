from django.test import Client, TestCase

from apps.usuarios.models import Usuario


class PermisosClientesTests(TestCase):
    def test_cliente_no_puede_listar_clientes_del_admin(self):
        usuario = Usuario.objects.create_user(
            "cliente_perm", password="ClientePerm123!", rol=Usuario.Rol.CLIENTE,
            email="cliente.perm@test.local", first_name="Cliente", last_name="Perm",
        )
        cliente = Client()
        self.assertTrue(cliente.login(username=usuario.username, password="ClientePerm123!"))
        respuesta = cliente.get("/clientes/")
        self.assertEqual(respuesta.status_code, 403)
