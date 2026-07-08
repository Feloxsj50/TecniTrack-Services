from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("servicios", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="solicitudservicio",
            name="cliente_presencial",
            field=models.CharField(blank=True, max_length=140),
        ),
    ]
