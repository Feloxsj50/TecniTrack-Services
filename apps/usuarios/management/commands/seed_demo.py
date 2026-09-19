from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.clientes.models import Cliente
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Usuario


class Command(BaseCommand):
    help = "Crea usuarios demo iniciales para TecniTrack en desarrollo."

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm-development-data",
            action="store_true",
            help="Confirma que los datos demo se crearan en un entorno de desarrollo.",
        )
        parser.add_argument(
            "--reset-passwords",
            action="store_true",
            help="Restablece explicitamente las contrasenas de las cuentas demo existentes.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo solo puede ejecutarse cuando DEBUG=True.")

        if not options["confirm_development_data"]:
            raise CommandError(
                "Debes confirmar el uso de datos de desarrollo con "
                "--confirm-development-data."
            )

        reset_passwords = options["reset_passwords"]

        with transaction.atomic():
            _, admin_creado = self.crear_usuario(
                username="admin",
                password="admin123",
                reset_password=reset_passwords,
                email="admin@tecnitrack.com",
                first_name="Administrador",
                last_name="TecniTrack",
                rol=Usuario.Rol.ADMIN,
                is_staff=False,
                is_superuser=False,
            )

            tecnico, tecnico_creado = self.crear_usuario(
                username="tecnico",
                password="tec123",
                reset_password=reset_passwords,
                email="tecnico@tecnitrack.com",
                first_name="Tecnico",
                last_name="Principal",
                rol=Usuario.Rol.TECNICO,
                telefono="8888-0001",
            )
            Tecnico.objects.get_or_create(
                usuario=tecnico,
                defaults={"especialidad": "Reparacion de laptops y PC"},
            )

            cliente, cliente_creado = self.crear_usuario(
                username="cliente",
                password="cli123",
                reset_password=reset_passwords,
                email="cliente@tecnitrack.com",
                first_name="Cliente",
                last_name="Demo",
                rol=Usuario.Rol.CLIENTE,
                telefono="8888-0002",
            )
            Cliente.objects.get_or_create(usuario=cliente)

        creados = sum([admin_creado, tecnico_creado, cliente_creado])
        self.stdout.write(self.style.SUCCESS("Datos demo listos para desarrollo."))
        self.stdout.write(f"Usuarios creados: {creados}; existentes preservados: {3 - creados}.")
        if reset_passwords:
            self.stdout.write(self.style.WARNING("Contrasenas demo restablecidas explicitamente."))

    def crear_usuario(self, username, password, reset_password, **datos):
        usuario = Usuario.objects.select_for_update().filter(username=username).first()

        if usuario:
            if usuario.is_staff or usuario.is_superuser:
                raise CommandError(
                    f"El usuario '{username}' ya es una cuenta privilegiada. "
                    "seed_demo no la modificara ni degradara."
                )

            rol_esperado = datos["rol"]
            if usuario.rol != rol_esperado:
                raise CommandError(
                    f"El usuario '{username}' ya existe con un rol diferente. "
                    "seed_demo no reemplazara cuentas existentes."
                )

            if reset_password:
                usuario.set_password(password)
                usuario.save(update_fields=["password"])

            return usuario, False

        usuario = Usuario.objects.create_user(
            username=username,
            password=password,
            activo=True,
            **datos,
        )
        return usuario, True
