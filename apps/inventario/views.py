import json
from decimal import Decimal, InvalidOperation

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from apps.usuarios.models import Usuario
from .models import ProductoInventario


CATEGORIAS_VALIDAS = {valor for valor, _ in ProductoInventario.Categoria.choices}


def obtener_datos_request(request):
    if request.content_type and request.content_type.startswith("application/json"):
        try:
            return json.loads(request.body.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, JsonResponse({"ok": False, "error": "Datos invalidos."}, status=400)

    return request.POST, None


def validar_admin(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesion activa."}, status=401)

    if request.user.rol != Usuario.Rol.ADMIN:
        return JsonResponse({"ok": False, "error": "Solo admin puede modificar inventario."}, status=403)

    return None


def entero_no_negativo(valor, campo):
    try:
        numero = int(valor)
    except (TypeError, ValueError):
        raise ValueError(f"{campo} debe ser un numero entero.")
    if numero < 0:
        raise ValueError(f"{campo} no puede ser negativo.")
    return numero


def decimal_no_negativo(valor, campo):
    try:
        numero = Decimal(str(valor or "0"))
    except (InvalidOperation, TypeError):
        raise ValueError(f"{campo} debe ser un monto valido.")
    if numero < 0:
        raise ValueError(f"{campo} no puede ser negativo.")
    return numero.quantize(Decimal("0.01"))


def serializar_producto(producto):
    return {
        "id": producto.codigo,
        "dbId": producto.id,
        "nombre": producto.nombre,
        "categoria": producto.categoria,
        "proveedor": producto.proveedor,
        "serie": producto.serie,
        "stock": producto.stock,
        "stockMinimo": producto.stock_minimo,
        "compra": float(producto.precio_compra),
        "venta": float(producto.precio_venta),
        "ubicacion": producto.ubicacion,
        "nota": producto.nota,
        "estado": producto.estado,
        "activo": producto.activo,
        "creadoEn": producto.creado_en.isoformat(),
        "actualizadoEn": producto.actualizado_en.isoformat(),
    }


def validar_producto(datos):
    nombre = str(datos.get("nombre", "")).strip()
    categoria = str(datos.get("categoria", "")).strip()
    proveedor = str(datos.get("proveedor", "")).strip()
    serie = str(datos.get("serie", "")).strip()
    ubicacion = str(datos.get("ubicacion", "")).strip()
    nota = str(datos.get("nota", "")).strip()

    if not all([nombre, categoria, ubicacion]):
        return None, JsonResponse({"ok": False, "error": "Completa nombre, categoria y ubicacion."}, status=400)

    if len(nombre) < 3:
        return None, JsonResponse({"ok": False, "error": "El nombre del producto debe tener al menos 3 caracteres."}, status=400)

    if categoria not in CATEGORIAS_VALIDAS:
        return None, JsonResponse({"ok": False, "error": "Categoria invalida."}, status=400)

    try:
        stock = entero_no_negativo(datos.get("stock"), "El stock")
        stock_minimo = entero_no_negativo(datos.get("stockMinimo", datos.get("stock_minimo")), "El stock minimo")
        compra = decimal_no_negativo(datos.get("compra", datos.get("precioCompra")), "El precio de compra")
        venta = decimal_no_negativo(datos.get("venta", datos.get("precioVenta")), "El precio de venta")
    except ValueError as exc:
        return None, JsonResponse({"ok": False, "error": str(exc)}, status=400)

    if venta < compra:
        return None, JsonResponse({"ok": False, "error": "El precio de venta no puede ser menor que el precio de compra."}, status=400)

    return {
        "nombre": nombre,
        "categoria": categoria,
        "proveedor": proveedor,
        "serie": serie,
        "stock": stock,
        "stock_minimo": stock_minimo,
        "precio_compra": compra,
        "precio_venta": venta,
        "ubicacion": ubicacion,
        "nota": nota,
    }, None


@require_GET
def listar_productos(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesion activa."}, status=401)

    productos = ProductoInventario.objects.filter(activo=True)
    data = [serializar_producto(producto) for producto in productos]
    return JsonResponse({"ok": True, "productos": data, "total": len(data)})


@require_POST
def crear_producto(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    datos, error = obtener_datos_request(request)
    if error:
        return error

    limpio, error = validar_producto(datos)
    if error:
        return error

    producto = ProductoInventario.objects.create(**limpio)
    return JsonResponse({"ok": True, "producto": serializar_producto(producto)}, status=201)


@require_POST
def actualizar_producto(request, producto_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    try:
        producto = ProductoInventario.objects.get(id=producto_id, activo=True)
    except ProductoInventario.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Producto no encontrado."}, status=404)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    limpio, error = validar_producto(datos)
    if error:
        return error

    for campo, valor in limpio.items():
        setattr(producto, campo, valor)
    producto.save()
    return JsonResponse({"ok": True, "producto": serializar_producto(producto)})


@require_POST
def eliminar_producto(request, producto_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    try:
        producto = ProductoInventario.objects.get(id=producto_id, activo=True)
    except ProductoInventario.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Producto no encontrado."}, status=404)

    producto.activo = False
    producto.save(update_fields=["activo", "actualizado_en"])
    return JsonResponse({"ok": True})
