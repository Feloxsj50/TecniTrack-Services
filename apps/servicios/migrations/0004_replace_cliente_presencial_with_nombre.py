import django.db.models.deletion
from django.db import migrations, models


def copiar_nombre_cliente(apps, schema_editor):
    SolicitudServicio = apps.get_model("servicios", "SolicitudServicio")
    for solicitud in SolicitudServicio.objects.select_related("cliente__usuario"):
        nombre = getattr(solicitud, "cliente_presencial", "") or ""
        if not nombre and solicitud.cliente_id:
            usuario = solicitud.cliente.usuario
            nombre = " ".join(part for part in [usuario.first_name, usuario.last_name] if part).strip() or usuario.username
        solicitud.cliente_nombre = nombre
        solicitud.save(update_fields=["cliente_nombre"])


def eliminar_cliente_interno(apps, schema_editor):
    Usuario = apps.get_model("usuarios", "Usuario")
    Usuario.objects.filter(username="cliente_presencial").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("servicios", "0003_solicitudservicio_cliente_presencial"),
    ]

    operations = [
        migrations.AddField(
            model_name="solicitudservicio",
            name="cliente_nombre",
            field=models.CharField(blank=True, max_length=140),
        ),
        migrations.RunPython(copiar_nombre_cliente, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="solicitudservicio",
            name="cliente",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="solicitudes", to="clientes.cliente"),
        ),
        migrations.RemoveField(
            model_name="solicitudservicio",
            name="cliente_presencial",
        ),
        migrations.RunPython(eliminar_cliente_interno, migrations.RunPython.noop),
    ]

