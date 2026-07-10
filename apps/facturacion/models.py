from django.db import models

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
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-creado_en"]

    def save(self, *args, **kwargs):
        if not self.numero:
            ultimo = Factura.objects.order_by("-id").first()
            siguiente = (ultimo.id + 1) if ultimo else 1
            self.numero = f"F-{siguiente:03d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.numero} - {self.total}"
