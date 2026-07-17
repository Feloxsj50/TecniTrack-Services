from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("servicios", "0004_replace_cliente_presencial_with_nombre"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="HistorialSolicitud",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("accion", models.CharField(max_length=40)),
                ("estado_anterior", models.CharField(blank=True, max_length=20)),
                ("estado_nuevo", models.CharField(blank=True, max_length=20)),
                ("detalle", models.TextField(blank=True)),
                ("creado_en", models.DateTimeField(auto_now_add=True)),
                ("solicitud", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="historial", to="servicios.solicitudservicio")),
                ("usuario", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="cambios_solicitudes", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-creado_en"]},
        ),
    ]
