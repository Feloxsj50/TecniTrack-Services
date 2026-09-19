from collections import Counter

from django.db.models import Q

from apps.inventario.models import MovimientoInventario, ProductoInventario


def _resolver_lineas(productos, exigir_activo):
    cantidades = Counter()
    productos_por_linea = []

    for item in productos or []:
        nombre = str(item.get("producto") or item.get("nombre") or "").strip()
        try:
            cantidad = int(item.get("cantidad", 0) or 0)
        except (TypeError, ValueError) as exc:
            raise ValueError("La cantidad de un repuesto guardado no es valida.") from exc

        if cantidad <= 0:
            raise ValueError("La cantidad de cada repuesto debe ser mayor que 0.")

        consulta = ProductoInventario.objects.all()
        producto_id = item.get("productoId")
        if producto_id:
            consulta = consulta.filter(pk=producto_id)
        else:
            consulta = consulta.filter(
                Q(codigo__iexact=nombre) | Q(nombre__iexact=nombre)
            )
        if exigir_activo:
            consulta = consulta.filter(activo=True)

        producto = consulta.order_by("id").first()
        if not producto:
            raise ValueError(f"El repuesto '{nombre}' no existe en el inventario.")

        cantidades[producto.id] += cantidad
        productos_por_linea.append(producto.id)

    return cantidades, productos_por_linea


def _bloquear_cambio_inventario(productos_nuevos, factura=None):
    productos_anteriores = (
        factura.productos
        if factura and factura.inventario_descontado
        else []
    )
    cantidades_anteriores, _ = _resolver_lineas(
        productos_anteriores,
        exigir_activo=False,
    )
    cantidades_nuevas, productos_por_linea = _resolver_lineas(
        productos_nuevos,
        exigir_activo=True,
    )

    ids_afectados = sorted(set(cantidades_anteriores) | set(cantidades_nuevas))
    if ids_afectados:
        productos_bloqueados = list(
            ProductoInventario.objects.select_for_update()
            .filter(id__in=ids_afectados)
            .order_by("id")
        )
    else:
        productos_bloqueados = []
    productos_por_id = {producto.id: producto for producto in productos_bloqueados}

    if set(productos_por_id) != set(ids_afectados):
        raise ValueError("Uno de los repuestos de la factura ya no existe.")

    for producto_id, cantidad in cantidades_nuevas.items():
        producto = productos_por_id[producto_id]
        if not producto.activo:
            raise ValueError(f"El repuesto '{producto.nombre}' ya no esta activo.")
        disponible = producto.stock + cantidades_anteriores.get(producto_id, 0)
        if disponible < cantidad:
            raise ValueError(
                f"No hay stock suficiente de '{producto.nombre}'. "
                f"Disponible: {disponible}."
            )

    return (
        productos_por_id,
        cantidades_anteriores,
        cantidades_nuevas,
        productos_por_linea,
    )


def _restaurar_cantidades(productos_por_id, cantidades, solicitud):
    for producto_id in sorted(cantidades):
        cantidad = cantidades[producto_id]
        producto = productos_por_id[producto_id]
        anterior = producto.stock
        producto.stock += cantidad
        producto.save(update_fields=["stock", "actualizado_en"])
        MovimientoInventario.objects.create(
            producto=producto,
            solicitud=solicitud,
            usuario=None,
            tipo=MovimientoInventario.Tipo.AJUSTE,
            cantidad=cantidad,
            stock_anterior=anterior,
            stock_nuevo=producto.stock,
        )


def _descontar_cantidades(productos_por_id, cantidades, solicitud, usuario):
    for producto_id in sorted(cantidades):
        cantidad = cantidades[producto_id]
        producto = productos_por_id[producto_id]
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


def ajustar_stock_factura(productos_nuevos, solicitud, usuario, factura=None):
    (
        productos_por_id,
        cantidades_anteriores,
        cantidades_nuevas,
        productos_por_linea,
    ) = _bloquear_cambio_inventario(productos_nuevos, factura)

    _restaurar_cantidades(
        productos_por_id,
        cantidades_anteriores,
        solicitud,
    )
    _descontar_cantidades(
        productos_por_id,
        cantidades_nuevas,
        solicitud,
        usuario,
    )

    productos_guardados = []
    for item, producto_id in zip(productos_nuevos, productos_por_linea):
        productos_guardados.append({**item, "productoId": producto_id})

    return productos_guardados, bool(cantidades_nuevas)


def restaurar_stock_factura(factura):
    (
        productos_por_id,
        cantidades_anteriores,
        _,
        _,
    ) = _bloquear_cambio_inventario([], factura)
    _restaurar_cantidades(
        productos_por_id,
        cantidades_anteriores,
        factura.solicitud,
    )
