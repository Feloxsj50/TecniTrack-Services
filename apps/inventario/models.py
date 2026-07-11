from django.db import models


class ProductoInventario(models.Model):
    class Categoria(models.TextChoices):
        ALMACENAMIENTO = "Almacenamiento", "Almacenamiento"
        PANTALLAS = "Pantallas", "Pantallas"
        BATERIAS = "Baterias", "Baterias"
        ACCESORIOS = "Accesorios", "Accesorios"
        CABLES = "Cables", "Cables"
        OTROS = "Otros", "Otros"

    codigo = models.CharField(max_length=20, unique=True, blank=True)
    nombre = models.CharField(max_length=140)
    categoria = models.CharField(max_length=40, choices=Categoria.choices)
    proveedor = models.CharField(max_length=120, blank=True)
    serie = models.CharField(max_length=120, blank=True)
    stock = models.PositiveIntegerField(default=0)
    stock_minimo = models.PositiveIntegerField(default=0)
    precio_compra = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    precio_venta = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    ubicacion = models.CharField(max_length=120)
    nota = models.CharField(max_length=180, blank=True)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nombre"]

    def save(self, *args, **kwargs):
        if not self.codigo:
            ultimo = ProductoInventario.objects.order_by("-id").first()
            siguiente = (ultimo.id + 1) if ultimo else 1
            self.codigo = f"PR-{siguiente:03d}"
        super().save(*args, **kwargs)

    @property
    def estado(self):
        if self.stock == 0:
            return "Agotado"
        if self.stock <= self.stock_minimo:
            return "Bajo"
        return "Disponible"

    def __str__(self):
        return f"{self.codigo} - {self.nombre}"


class MovimientoInventario(models.Model):
    class Tipo(models.TextChoices):
        REGISTRO = "registro", "Registro"
        AJUSTE = "ajuste", "Ajuste"

    producto = models.ForeignKey(
        ProductoInventario,
        on_delete=models.CASCADE,
        related_name="movimientos",
    )
    usuario = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="movimientos_inventario",
    )
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    cantidad = models.IntegerField()
    stock_anterior = models.PositiveIntegerField(default=0)
    stock_nuevo = models.PositiveIntegerField(default=0)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-creado_en"]
