from django.conf import settings
from django.db import models


class TicketSoporte(models.Model):
    class Estado(models.TextChoices):
        ABIERTO = "abierto", "Abierto"
        RESPONDIDO = "respondido", "Respondido"

    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tickets_soporte")
    rol = models.CharField(max_length=20)
    nombre = models.CharField(max_length=120)
    correo = models.EmailField()
    asunto = models.CharField(max_length=140)
    area = models.CharField(max_length=80)
    detalle = models.TextField()
    respuesta = models.TextField(blank=True)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.ABIERTO)
    creado_en = models.DateTimeField(auto_now_add=True)
    respondido_en = models.DateTimeField(null=True, blank=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-creado_en"]

    def __str__(self):
        return f"TK-{self.id:03d} - {self.asunto}"