from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("servicios", "0005_historialsolicitud"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameField(
            model_name="historialsolicitud",
            old_name="detalle",
            new_name="descripcion",
        ),
        migrations.AlterModelOptions(
            name="historialsolicitud",
            options={"ordering": ["creado_en", "id"]},
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="solicitud_codigo",
            field=models.CharField(default="", max_length=20),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="usuario_username",
            field=models.CharField(blank=True, default="", max_length=150),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="usuario_nombre",
            field=models.CharField(blank=True, default="", max_length=150),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="usuario_rol",
            field=models.CharField(blank=True, default="", max_length=20),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="tecnico_anterior",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="tecnicos.tecnico",
            ),
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="tecnico_anterior_username",
            field=models.CharField(blank=True, default="", max_length=150),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="tecnico_anterior_nombre",
            field=models.CharField(blank=True, default="", max_length=150),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="tecnico_nuevo",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="tecnicos.tecnico",
            ),
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="tecnico_nuevo_username",
            field=models.CharField(blank=True, default="", max_length=150),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="tecnico_nuevo_nombre",
            field=models.CharField(blank=True, default="", max_length=150),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="historialsolicitud",
            name="visibilidad",
            field=models.CharField(
                choices=[("publico", "Público"), ("interno", "Interno")],
                default="publico",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="historialsolicitud",
            name="accion",
            field=models.CharField(
                choices=[
                    ("creacion", "Creación"),
                    ("asignacion", "Asignación"),
                    ("inicio", "Inicio"),
                    ("cambio_estado", "Cambio de estado"),
                    ("diagnostico", "Diagnóstico"),
                    ("finalizacion", "Finalización"),
                    ("cancelacion", "Cancelación"),
                ],
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="historialsolicitud",
            name="descripcion",
            field=models.TextField(),
        ),
        migrations.AlterField(
            model_name="historialsolicitud",
            name="estado_anterior",
            field=models.CharField(
                blank=True,
                choices=[
                    ("pendiente", "Pendiente"),
                    ("en_proceso", "En proceso"),
                    ("completado", "Completado"),
                    ("cancelado", "Cancelado"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="historialsolicitud",
            name="estado_nuevo",
            field=models.CharField(
                blank=True,
                choices=[
                    ("pendiente", "Pendiente"),
                    ("en_proceso", "En proceso"),
                    ("completado", "Completado"),
                    ("cancelado", "Cancelado"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="historialsolicitud",
            name="solicitud",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="historial",
                to="servicios.solicitudservicio",
            ),
        ),
        migrations.AddIndex(
            model_name="historialsolicitud",
            index=models.Index(
                fields=["solicitud", "creado_en"],
                name="hist_sol_fecha_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="historialsolicitud",
            index=models.Index(
                fields=["solicitud", "visibilidad"],
                name="hist_sol_vis_idx",
            ),
        ),
    ]
