from django.db import models

from apps.clientes.models import Cliente
from apps.tecnicos.models import Tecnico


class SolicitudServicio(models.Model):
    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        EN_PROCESO = "en_proceso", "En proceso"
        COMPLETADO = "completado", "Completado"
        CANCELADO = "cancelado", "Cancelado"

    class Prioridad(models.TextChoices):
        BAJA = "baja", "Baja"
        MEDIA = "media", "Media"
        ALTA = "alta", "Alta"

    cliente = models.ForeignKey(Cliente, on_delete=models.PROTECT, related_name="solicitudes")
    tecnico = models.ForeignKey(
        Tecnico,
        on_delete=models.SET_NULL,
        related_name="trabajos",
        blank=True,
        null=True,
    )
    dispositivo = models.CharField(max_length=120)
    problema = models.CharField(max_length=180)
    fecha_preferida = models.DateField(blank=True, null=True)
    prioridad = models.CharField(max_length=20, choices=Prioridad.choices, default=Prioridad.MEDIA)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)
    diagnostico = models.TextField(blank=True)
    repuesto_usado = models.CharField(max_length=160, blank=True)
    notas_admin = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-creado_en"]

    def __str__(self):
        return f"{self.cliente} - {self.dispositivo} ({self.get_estado_display()})"
