import os
import shutil
import subprocess
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Restaura un respaldo SQL en una base PostgreSQL."

    def add_arguments(self, parser):
        parser.add_argument("input", help="Ruta del archivo .sql que se restaurara.")
        parser.add_argument("--database", help="Base destino. Por defecto usa la configurada en Django.")
        parser.add_argument("--confirm", action="store_true", help="Confirma la restauracion sobre la base destino.")

    def handle(self, *args, **options):
        database = settings.DATABASES["default"]
        if database.get("ENGINE") != "django.db.backends.postgresql":
            raise CommandError("La base configurada no es PostgreSQL.")

        input_path = Path(options["input"]).resolve()
        if not input_path.is_file() or input_path.suffix.lower() != ".sql":
            raise CommandError("Indica un archivo SQL existente.")

        target = options.get("database") or database["NAME"]
        if target == database["NAME"] and not options["confirm"]:
            raise CommandError("Para restaurar sobre la base principal debes agregar --confirm.")

        psql = os.getenv("PSQL_PATH") or shutil.which("psql")
        if not psql:
            for candidate in [
                Path("C:/Program Files/PostgreSQL/18/bin/psql.exe"),
                Path("C:/Program Files/PostgreSQL/17/bin/psql.exe"),
            ]:
                if candidate.exists():
                    psql = str(candidate)
                    break
        if not psql:
            raise CommandError("No se encontro psql. Agregalo al PATH o define PSQL_PATH.")

        environment = os.environ.copy()
        environment["PGPASSWORD"] = str(database["PASSWORD"])
        command = [
            psql,
            "--host", str(database.get("HOST") or "localhost"),
            "--port", str(database.get("PORT") or "5432"),
            "--username", str(database["USER"]),
            "--dbname", str(target),
            "--file", str(input_path),
            "--set", "ON_ERROR_STOP=1",
        ]
        resultado = subprocess.run(command, env=environment, capture_output=True, text=True)
        if resultado.returncode:
            raise CommandError(resultado.stderr.strip() or "psql no pudo restaurar el respaldo.")
        self.stdout.write(self.style.SUCCESS(f"Respaldo restaurado en: {target}"))
