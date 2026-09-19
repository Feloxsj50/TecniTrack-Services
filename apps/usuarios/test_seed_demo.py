from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client, TestCase, override_settings

from apps.clientes.models import Cliente
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Usuario


@override_settings(DEBUG=True)
class SeedDemoCommandTests(TestCase):
    def ejecutar(self, **options):
        salida = StringIO()
        call_command("seed_demo", stdout=salida, **options)
        return salida.getvalue()

    @override_settings(DEBUG=False)
    def test_rechaza_ejecucion_fuera_de_desarrollo(self):
        with self.assertRaisesMessage(CommandError, "DEBUG=True"):
            self.ejecutar(confirm_development_data=True)

        self.assertFalse(Usuario.objects.exists())

    def test_exige_confirmacion_explicita(self):
        with self.assertRaisesMessage(CommandError, "--confirm-development-data"):
            self.ejecutar()

        self.assertFalse(Usuario.objects.exists())

    def test_crea_cuentas_demo_sin_privilegios_django(self):
        self.ejecutar(confirm_development_data=True)

        admin = Usuario.objects.get(username="admin")
        self.assertEqual(admin.rol, Usuario.Rol.ADMIN)
        self.assertTrue(admin.activo)
        self.assertFalse(admin.is_staff)
        self.assertFalse(admin.is_superuser)
        self.assertTrue(admin.check_password("admin123"))
        self.assertTrue(Tecnico.objects.filter(usuario__username="tecnico").exists())
        self.assertTrue(Cliente.objects.filter(usuario__username="cliente").exists())

        cliente_web = Client()
        self.assertTrue(cliente_web.login(username="admin", password="admin123"))
        self.assertEqual(cliente_web.get("/dashboard/reportes/").status_code, 200)
        self.assertEqual(cliente_web.get("/admin/").status_code, 302)

    def test_segunda_ejecucion_no_duplica_usuarios_ni_perfiles(self):
        self.ejecutar(confirm_development_data=True)
        identificadores = dict(Usuario.objects.values_list("username", "id"))

        self.ejecutar(confirm_development_data=True)

        self.assertEqual(Usuario.objects.count(), 3)
        self.assertEqual(dict(Usuario.objects.values_list("username", "id")), identificadores)
        self.assertEqual(Tecnico.objects.count(), 1)
        self.assertEqual(Cliente.objects.count(), 1)

    def test_preserva_datos_de_usuarios_existentes(self):
        admin = Usuario.objects.create_user(
            username="admin",
            password="ClavePersonal123!",
            email="admin.existente@test.local",
            first_name="Nombre conservado",
            rol=Usuario.Rol.ADMIN,
        )
        tecnico = Usuario.objects.create_user(
            username="tecnico",
            password="ClaveTecnico123!",
            email="tecnico.existente@test.local",
            rol=Usuario.Rol.TECNICO,
        )
        cliente = Usuario.objects.create_user(
            username="cliente",
            password="ClaveCliente123!",
            email="cliente.existente@test.local",
            rol=Usuario.Rol.CLIENTE,
        )
        identificadores = {usuario.username: usuario.id for usuario in [admin, tecnico, cliente]}

        self.ejecutar(confirm_development_data=True)

        admin.refresh_from_db()
        tecnico.refresh_from_db()
        cliente.refresh_from_db()
        self.assertEqual(admin.email, "admin.existente@test.local")
        self.assertEqual(admin.first_name, "Nombre conservado")
        self.assertTrue(admin.check_password("ClavePersonal123!"))
        self.assertTrue(tecnico.check_password("ClaveTecnico123!"))
        self.assertTrue(cliente.check_password("ClaveCliente123!"))
        self.assertEqual(
            dict(Usuario.objects.values_list("username", "id")),
            identificadores,
        )

    def test_usuario_admin_existente_no_es_promovido(self):
        admin = Usuario.objects.create_user(
            username="admin",
            password="ClavePersonal123!",
            rol=Usuario.Rol.ADMIN,
            is_staff=False,
            is_superuser=False,
        )

        self.ejecutar(confirm_development_data=True)

        admin.refresh_from_db()
        self.assertFalse(admin.is_staff)
        self.assertFalse(admin.is_superuser)

    def test_protege_superusuario_existente_y_revierte_la_operacion(self):
        superusuario = Usuario.objects.create_superuser(
            username="admin",
            password="ClaveFuerteSuperusuario123!",
            email="superusuario@test.local",
            rol=Usuario.Rol.ADMIN,
        )

        with self.assertRaisesMessage(CommandError, "cuenta privilegiada"):
            self.ejecutar(confirm_development_data=True)

        superusuario.refresh_from_db()
        self.assertTrue(superusuario.is_staff)
        self.assertTrue(superusuario.is_superuser)
        self.assertEqual(Usuario.objects.count(), 1)
        self.assertFalse(Tecnico.objects.exists())
        self.assertFalse(Cliente.objects.exists())

    def test_solo_restablece_password_con_opcion_explicita(self):
        admin = Usuario.objects.create_user(
            username="admin",
            password="ClavePersonal123!",
            rol=Usuario.Rol.ADMIN,
        )

        self.ejecutar(confirm_development_data=True)
        admin.refresh_from_db()
        self.assertTrue(admin.check_password("ClavePersonal123!"))

        self.ejecutar(confirm_development_data=True, reset_passwords=True)
        admin.refresh_from_db()
        self.assertTrue(admin.check_password("admin123"))
