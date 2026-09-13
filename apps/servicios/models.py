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

    cliente = models.ForeignKey(
        Cliente,
        on_delete=models.SET_NULL,
        related_name="solicitudes",
        blank=True,
        null=True,
    )
    cliente_nombre = models.CharField(max_length=140, blank=True)
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
        cliente = self.cliente_nombre or self.cliente or "Cliente sin cuenta"
        return f"{cliente} - {self.dispositivo} ({self.get_estado_display()})"


class HistorialSolicitud(models.Model):
    class TipoEvento(models.TextChoices):
        CREACION = "creacion", "Creación"
        ASIGNACION = "asignacion", "Asignación"
        INICIO = "inicio", "Inicio"
        CAMBIO_ESTADO = "cambio_estado", "Cambio de estado"
        DIAGNOSTICO = "diagnostico", "Diagnóstico"
        FINALIZACION = "finalizacion", "Finalización"
        CANCELACION = "cancelacion", "Cancelación"

    class Visibilidad(models.TextChoices):
        PUBLICO = "publico", "Público"
        INTERNO = "interno", "Interno"

    solicitud = models.ForeignKey(
        SolicitudServicio,
        on_delete=models.SET_NULL,
        null=True,
        related_name="historial",
    )
    solicitud_codigo = models.CharField(max_length=20)
    usuario = models.ForeignKey(
        "usuarios.Usuario", on_delete=models.SET_NULL, null=True, blank=True, related_name="cambios_solicitudes"
    )
    usuario_username = models.CharField(max_length=150, blank=True)
    usuario_nombre = models.CharField(max_length=150, blank=True)
    usuario_rol = models.CharField(max_length=20, blank=True)
    tecnico_anterior = models.ForeignKey(
        Tecnico,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    tecnico_anterior_username = models.CharField(max_length=150, blank=True)
    tecnico_anterior_nombre = models.CharField(max_length=150, blank=True)
    tecnico_nuevo = models.ForeignKey(
        Tecnico,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    tecnico_nuevo_username = models.CharField(max_length=150, blank=True)
    tecnico_nuevo_nombre = models.CharField(max_length=150, blank=True)
    accion = models.CharField(max_length=30, choices=TipoEvento.choices)
    estado_anterior = models.CharField(max_length=20, choices=SolicitudServicio.Estado.choices, blank=True)
    estado_nuevo = models.CharField(max_length=20, choices=SolicitudServicio.Estado.choices, blank=True)
    descripcion = models.TextField()
    visibilidad = models.CharField(
        max_length=10,
        choices=Visibilidad.choices,
        default=Visibilidad.PUBLICO,
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["creado_en", "id"]
        indexes = [
            models.Index(fields=["solicitud", "creado_en"], name="hist_sol_fecha_idx"),
            models.Index(fields=["solicitud", "visibilidad"], name="hist_sol_vis_idx"),
        ]

    def __str__(self):
        return f"{self.get_accion_display()} - {self.solicitud_codigo}"
