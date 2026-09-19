from uuid import uuid4

from django.db import models, router, transaction

from apps.servicios.models import SolicitudServicio


class Factura(models.Model):
    class Estado(models.TextChoices):
        PAGADO = "pagado", "Pagado"
        PENDIENTE = "pendiente", "Pendiente"

    class MetodoPago(models.TextChoices):
        EFECTIVO = "efectivo", "Efectivo"
        TRANSFERENCIA = "transferencia", "Transferencia"
        TARJETA = "tarjeta", "Tarjeta"

    numero = models.CharField(max_length=20, unique=True, blank=True)
    solicitud = models.OneToOneField(
        SolicitudServicio,
        on_delete=models.PROTECT,
        related_name="factura",
    )
    fecha = models.DateField(auto_now_add=True)
    servicio_monto = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    repuestos_monto = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    metodo_pago = models.CharField(max_length=20, choices=MetodoPago.choices, default=MetodoPago.EFECTIVO)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PAGADO)
    garantia = models.CharField(max_length=40, default="30 Días")
    productos = models.JSONField(default=list, blank=True)
    inventario_descontado = models.BooleanField(default=False)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-creado_en"]

    def save(self, *args, **kwargs):
        if self.numero or not self._state.adding:
            return super().save(*args, **kwargs)

        # El PK de PostgreSQL da el numero definitivo; el valor temporal satisface UNIQUE.
        using = kwargs.get("using") or router.db_for_write(type(self), instance=self)
        kwargs["using"] = using
        if transaction.get_connection(using).in_atomic_block:
            return self._guardar_con_numero_generado(*args, **kwargs)

        with transaction.atomic(using=using):
            return self._guardar_con_numero_generado(*args, **kwargs)

    def _guardar_con_numero_generado(self, *args, **kwargs):
        using = kwargs["using"]
        self.numero = f"TMP-{uuid4().hex[:16]}"
        super().save(*args, **kwargs)
        self.numero = f"F-{self.pk:03d}"
        type(self).objects.using(using).filter(pk=self.pk).update(numero=self.numero)

    def __str__(self):
        return f"{self.numero} - {self.total}"
