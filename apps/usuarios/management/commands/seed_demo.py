from django.core.management.base import BaseCommand

from apps.clientes.models import Cliente
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Usuario


class Command(BaseCommand):
    help = "Crea usuarios demo iniciales para TecniTrack."

    def handle(self, *args, **options):
        admin = self.crear_usuario(
            username="admin",
            password="admin123",
            email="admin@tecnitrack.com",
            first_name="Administrador",
            last_name="TecniTrack",
            rol=Usuario.Rol.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        tecnico = self.crear_usuario(
            username="tecnico",
            password="tec123",
            email="tecnico@tecnitrack.com",
            first_name="Técnico",
            last_name="Principal",
            rol=Usuario.Rol.TECNICO,
            telefono="8888-0001",
        )
        Tecnico.objects.get_or_create(
            usuario=tecnico,
            defaults={"especialidad": "Reparacion de laptops y PC"},
        )

        cliente = self.crear_usuario(
            username="cliente",
            password="cli123",
            email="cliente@tecnitrack.com",
            first_name="Cliente",
            last_name="Demo",
            rol=Usuario.Rol.CLIENTE,
            telefono="8888-0002",
        )
        Cliente.objects.get_or_create(usuario=cliente)

        self.stdout.write(self.style.SUCCESS("Datos demo listos."))
        self.stdout.write(f"Admin: {admin.username} / admin123")
        self.stdout.write("Técnico: tecnico / tec123")
        self.stdout.write("Cliente: cliente / cli123")

    def crear_usuario(self, username, password, **datos):
        usuario, creado = Usuario.objects.get_or_create(username=username, defaults=datos)

        if creado:
            usuario.set_password(password)
        else:
            for campo, valor in datos.items():
                setattr(usuario, campo, valor)

        usuario.activo = True
        usuario.save()
        return usuario
