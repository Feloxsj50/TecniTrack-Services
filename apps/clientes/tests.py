import json
from datetime import date

from django.test import Client, TestCase

from apps.clientes.models import Cliente
from apps.garantias.services import crear_garantia, crear_reingreso
from apps.servicios.models import SolicitudServicio
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

    def test_eliminar_cliente_preserva_ordenes_relacionadas_con_garantia(self):
        admin = Usuario.objects.create_superuser(
            "admin_eliminar_cliente",
            "admin.eliminar@test.local",
            "AdminEliminar123!",
        )
        admin.rol = Usuario.Rol.ADMIN
        admin.activo = True
        admin.save(update_fields=["rol", "activo"])
        usuario = Usuario.objects.create_user(
            "cliente_protegido",
            password="ClienteProtegido123!",
            first_name="Cliente",
            last_name="Protegido",
            rol=Usuario.Rol.CLIENTE,
        )
        perfil = Cliente.objects.create(usuario=usuario)
        original = SolicitudServicio.objects.create(
            cliente=perfil,
            dispositivo="Laptop",
            problema="No enciende",
            fecha_preferida=date.today(),
            estado=SolicitudServicio.Estado.COMPLETADO,
        )
        eliminable = SolicitudServicio.objects.create(
            cliente=perfil,
            dispositivo="Teclado",
            problema="Tecla dañada",
            fecha_preferida=date.today(),
        )
        garantia = crear_garantia(original.id, 30, admin)
        reingreso = crear_reingreso(garantia.id, admin, "Falla repetida")
        admin_client = Client()
        admin_client.force_login(admin)

        respuesta = admin_client.post(
            f"/clientes/{perfil.id}/eliminar/",
            data=json.dumps({"eliminarSolicitudes": True}),
            content_type="application/json",
        )

        self.assertEqual(respuesta.status_code, 200)
        self.assertFalse(SolicitudServicio.objects.filter(pk=eliminable.id).exists())
        original.refresh_from_db()
        reingreso.solicitud_reingreso.refresh_from_db()
        self.assertIsNone(original.cliente)
        self.assertIsNone(reingreso.solicitud_reingreso.cliente)
        self.assertEqual(original.cliente_nombre, "Cliente Protegido")
        self.assertEqual(
            reingreso.solicitud_reingreso.cliente_nombre,
            "Cliente Protegido",
        )
        self.assertFalse(Usuario.objects.filter(pk=usuario.id).exists())
