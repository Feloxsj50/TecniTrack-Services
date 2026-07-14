import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Genera un respaldo SQL de la base de datos PostgreSQL."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output",
            help="Ruta del archivo de salida. Por defecto: backups/tecnitrack-YYYYMMDD-HHMMSS.sql",
        )

    def handle(self, *args, **options):
        database = settings.DATABASES["default"]
        if database.get("ENGINE") != "django.db.backends.postgresql":
            raise CommandError("La base configurada no es PostgreSQL.")

        pg_dump = os.getenv("PG_DUMP_PATH") or shutil.which("pg_dump")
        if not pg_dump:
            candidatos = [
                Path("C:/Program Files/PostgreSQL/18/bin/pg_dump.exe"),
                Path("C:/Program Files/PostgreSQL/17/bin/pg_dump.exe"),
            ]
            pg_dump = next((str(path) for path in candidatos if path.exists()), None)
        if not pg_dump:
            raise CommandError("No se encontro pg_dump. Agregalo al PATH o define PG_DUMP_PATH.")

        output = options.get("output")
        if output:
            output_path = Path(output)
        else:
            output_path = settings.BASE_DIR / "backups" / f"tecnitrack-{datetime.now():%Y%m%d-%H%M%S}.sql"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        environment = os.environ.copy()
        environment["PGPASSWORD"] = str(database["PASSWORD"])
        command = [
            pg_dump,
            "--host", str(database.get("HOST") or "localhost"),
            "--port", str(database.get("PORT") or "5432"),
            "--username", str(database["USER"]),
            "--dbname", str(database["NAME"]),
            "--format", "plain",
            "--file", str(output_path),
        ]

        resultado = subprocess.run(command, env=environment, capture_output=True, text=True)
        if resultado.returncode != 0:
            if output_path.exists():
                output_path.unlink()
            raise CommandError(resultado.stderr.strip() or "pg_dump no pudo generar el respaldo.")

        self.stdout.write(self.style.SUCCESS(f"Respaldo creado: {output_path}"))
