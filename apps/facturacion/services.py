from collections import Counter

from django.db.models import Q

from apps.inventario.models import MovimientoInventario, ProductoInventario


def resolver_productos_inventario(productos):
    encontrados = []
    for item in productos:
        nombre = item["producto"]
        producto = ProductoInventario.objects.select_for_update().filter(
            Q(codigo__iexact=nombre) | Q(nombre__iexact=nombre), activo=True
        ).first()
        if not producto:
            raise ValueError(f"El repuesto '{nombre}' no existe en el inventario.")
        encontrados.append((producto, item["cantidad"]))
    return encontrados


def descontar_stock(productos, solicitud, usuario):
    cantidades = Counter()
    referencias = {}
    for producto, cantidad in productos:
        cantidades[producto.id] += cantidad
        referencias[producto.id] = producto

    for producto_id, cantidad in cantidades.items():
        producto = referencias[producto_id]
        if producto.stock < cantidad:
            raise ValueError(f"No hay stock suficiente de '{producto.nombre}'. Disponible: {producto.stock}.")
        anterior = producto.stock
        producto.stock -= cantidad
        producto.save(update_fields=["stock", "actualizado_en"])
        MovimientoInventario.objects.create(
            producto=producto,
            solicitud=solicitud,
            usuario=usuario,
            tipo=MovimientoInventario.Tipo.SALIDA,
            cantidad=-cantidad,
            stock_anterior=anterior,
            stock_nuevo=producto.stock,
        )


def restaurar_stock_factura(factura):
    cantidades = Counter()
    for item in factura.productos or []:
        nombre = str(item.get("producto") or item.get("nombre") or "").strip()
        cantidad = int(item.get("cantidad", 0) or 0)
        producto = ProductoInventario.objects.select_for_update().filter(
            Q(codigo__iexact=nombre) | Q(nombre__iexact=nombre)
        ).first()
        if producto and cantidad > 0:
            cantidades[producto.id] += cantidad

    for producto_id, cantidad in cantidades.items():
        producto = ProductoInventario.objects.select_for_update().get(id=producto_id)
        anterior = producto.stock
        producto.stock += cantidad
        producto.save(update_fields=["stock", "actualizado_en"])
        MovimientoInventario.objects.create(
            producto=producto,
            solicitud=factura.solicitud,
            usuario=None,
            tipo=MovimientoInventario.Tipo.AJUSTE,
            cantidad=cantidad,
            stock_anterior=anterior,
            stock_nuevo=producto.stock,
        )
