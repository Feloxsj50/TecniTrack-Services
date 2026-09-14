from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.servicios.models import SolicitudServicio


class Garantia(models.Model):
    class Estado(models.TextChoices):
        VIGENTE = "vigente", "Vigente"
        VENCIDA = "vencida", "Vencida"
        UTILIZADA = "utilizada", "Utilizada"
        ANULADA = "anulada", "Anulada"

    solicitud_original = models.OneToOneField(
        SolicitudServicio,
        on_delete=models.PROTECT,
        related_name="garantia",
    )
    duracion_dias = models.PositiveSmallIntegerField()
    fecha_inicio = models.DateField()
    fecha_vencimiento = models.DateField()
    condiciones_publicas = models.TextField(blank=True)
    notas_internas = models.TextField(blank=True)
    creada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="garantias_creadas",
    )
    creada_por_username = models.CharField(max_length=150, blank=True)
    creada_por_nombre = models.CharField(max_length=150, blank=True)
    creada_por_rol = models.CharField(max_length=20, blank=True)
    anulada_en = models.DateTimeField(null=True, blank=True)
    anulada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="garantias_anuladas",
    )
    anulada_por_username = models.CharField(max_length=150, blank=True)
    anulada_por_nombre = models.CharField(max_length=150, blank=True)
    anulada_por_rol = models.CharField(max_length=20, blank=True)
    motivo_anulacion = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-creado_en"]
        constraints = [
            models.CheckConstraint(
                condition=Q(duracion_dias__gt=0),
                name="garantia_duracion_positiva",
            ),
            models.CheckConstraint(
                condition=Q(fecha_vencimiento__gte=F("fecha_inicio")),
                name="garantia_fechas_validas",
            ),
        ]
        indexes = [
            models.Index(fields=["fecha_vencimiento"], name="garantia_vence_idx"),
            models.Index(fields=["anulada_en"], name="garantia_anulada_idx"),
        ]

    def clean(self):
        errores = {}
        if self._state.adding and self.solicitud_original_id:
            if self.solicitud_original.estado != SolicitudServicio.Estado.COMPLETADO:
                errores["solicitud_original"] = (
                    "Solo se puede crear una garantía para una orden completada."
                )
        if self.duracion_dias is not None and self.duracion_dias <= 0:
            errores["duracion_dias"] = "La duración debe ser mayor que cero."
        if self.fecha_inicio and self.duracion_dias and self.fecha_vencimiento:
            calculada = self.fecha_inicio + timedelta(days=self.duracion_dias)
            if self.fecha_vencimiento != calculada:
                errores["fecha_vencimiento"] = (
                    "La fecha de vencimiento no coincide con la duración indicada."
                )
        if errores:
            raise ValidationError(errores)

    @property
    def estado_actual(self):
        if self.anulada_en:
            return self.Estado.ANULADA
        if self.pk and ReingresoGarantia.objects.filter(garantia_id=self.pk).exists():
            return self.Estado.UTILIZADA
        if timezone.localdate() > self.fecha_vencimiento:
            return self.Estado.VENCIDA
        return self.Estado.VIGENTE

    @property
    def dias_restantes(self):
        if self.estado_actual != self.Estado.VIGENTE:
            return 0
        return max((self.fecha_vencimiento - timezone.localdate()).days, 0)

    @property
    def esta_vigente(self):
        return self.estado_actual == self.Estado.VIGENTE

    def __str__(self):
        return f"Garantía de SOL-{self.solicitud_original_id:03d} ({self.estado_actual})"


class ReingresoGarantia(models.Model):
    garantia = models.OneToOneField(
        Garantia,
        on_delete=models.PROTECT,
        related_name="reingreso",
    )
    solicitud_reingreso = models.OneToOneField(
        SolicitudServicio,
        on_delete=models.PROTECT,
        related_name="reingreso_garantia",
    )
    motivo = models.TextField()
    observaciones_internas = models.TextField(blank=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reingresos_garantia_registrados",
    )
    registrado_por_username = models.CharField(max_length=150, blank=True)
    registrado_por_nombre = models.CharField(max_length=150, blank=True)
    registrado_por_rol = models.CharField(max_length=20, blank=True)
    registrado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-registrado_en"]

    def clean(self):
        if (
            self.garantia_id
            and self.solicitud_reingreso_id
            and self.garantia.solicitud_original_id == self.solicitud_reingreso_id
        ):
            raise ValidationError({
                "solicitud_reingreso": "El reingreso debe crear una orden diferente de la original."
            })

    def __str__(self):
        return (
            f"Reingreso de SOL-{self.garantia.solicitud_original_id:03d} "
            f"como SOL-{self.solicitud_reingreso_id:03d}"
        )
