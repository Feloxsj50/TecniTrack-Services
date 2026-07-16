import json
from decimal import Decimal, InvalidOperation

from django.db import transaction

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from apps.servicios.models import SolicitudServicio
from apps.usuarios.models import Usuario
from apps.usuarios.auditoria import registrar_auditoria
from apps.usuarios.api import obtener_datos_request as obtener_datos_request_comun, validar_admin as validar_admin_comun
from .services import descontar_stock, resolver_productos_inventario, restaurar_stock_factura
from .models import Factura


METODOS_FRONT = {
    "Efectivo": Factura.MetodoPago.EFECTIVO,
    "Transferencia": Factura.MetodoPago.TRANSFERENCIA,
    "Tarjeta": Factura.MetodoPago.TARJETA,
}

ESTADOS_FRONT = {
    "Pagado": Factura.Estado.PAGADO,
    "Pendiente": Factura.Estado.PENDIENTE,
}


def obtener_datos_request(request):
    if request.content_type and request.content_type.startswith("application/json"):
        try:
            return json.loads(request.body.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, JsonResponse({"ok": False, "error": "Datos inválidos."}, status=400)

    return request.POST, None


def validar_admin(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    if request.user.rol != Usuario.Rol.ADMIN:
        return JsonResponse({"ok": False, "error": "Solo admin puede generar facturas."}, status=403)

    return None


def decimal_desde(valor, campo):
    try:
        numero = Decimal(str(valor or "0"))
    except (InvalidOperation, TypeError):
        raise ValueError(f"{campo} debe ser un monto válido.")

    if numero < 0:
        raise ValueError(f"{campo} no puede ser negativo.")

    return numero.quantize(Decimal("0.01"))


def nombre_cliente(solicitud):
    if solicitud.cliente:
        return solicitud.cliente.usuario.get_full_name() or solicitud.cliente.usuario.username
    return solicitud.cliente_nombre or "Cliente sin cuenta"


def nombre_tecnico(solicitud):
    if not solicitud.tecnico:
        return "Sin técnico"
    return solicitud.tecnico.usuario.get_full_name() or solicitud.tecnico.usuario.username


def serializar_solicitud_facturable(solicitud):
    return {
        "id": solicitud.id,
        "codigo": f"SOL-{solicitud.id:03d}",
        "fecha": solicitud.fecha_preferida.isoformat() if solicitud.fecha_preferida else "",
        "cliente": nombre_cliente(solicitud),
        "tecnico": nombre_tecnico(solicitud),
        "servicio": solicitud.problema,
        "dispositivo": solicitud.dispositivo,
        "estado": solicitud.get_estado_display(),
        "facturada": hasattr(solicitud, "factura"),
    }


def serializar_factura(factura):
    solicitud = factura.solicitud
    return {
        "id": factura.id,
        "numero": factura.numero,
        "fecha": factura.fecha.isoformat(),
        "solicitudId": solicitud.id,
        "solicitudCodigo": f"SOL-{solicitud.id:03d}",
        "cliente": nombre_cliente(solicitud),
        "tecnico": nombre_tecnico(solicitud),
        "servicio": solicitud.problema,
        "dispositivo": solicitud.dispositivo,
        "metodoPago": factura.get_metodo_pago_display(),
        "estado": factura.get_estado_display(),
        "garantia": factura.garantia,
        "montoServicio": float(factura.servicio_monto),
        "repuestosMonto": float(factura.repuestos_monto),
        "total": float(factura.total),
        "productos": factura.productos,
    }


def facturas_por_rol(usuario):
    facturas = Factura.objects.select_related(
        "solicitud__cliente__usuario",
        "solicitud__tecnico__usuario",
    )

    if usuario.rol == Usuario.Rol.ADMIN:
        return facturas

    if usuario.rol == Usuario.Rol.CLIENTE and hasattr(usuario, "perfil_cliente"):
        return facturas.filter(solicitud__cliente=usuario.perfil_cliente)

    if usuario.rol == Usuario.Rol.TECNICO and hasattr(usuario, "perfil_tecnico"):
        return facturas.filter(solicitud__tecnico=usuario.perfil_tecnico)

    return facturas.none()


@require_GET
def listar_facturas(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    if request.user.rol not in [Usuario.Rol.ADMIN, Usuario.Rol.CLIENTE]:
        return JsonResponse({"ok": False, "error": "No tienes permiso para consultar recibos."}, status=403)

    data = [serializar_factura(factura) for factura in facturas_por_rol(request.user)]
    return JsonResponse({"ok": True, "facturas": data, "total": len(data)})


@require_GET
def listar_servicios_completados(request):
    permiso = validar_admin_comun(request, "Solo el administrador puede consultar facturas.")
    if permiso:
        return permiso

    solicitudes = SolicitudServicio.objects.select_related(
        "cliente__usuario",
        "tecnico__usuario",
    ).filter(estado=SolicitudServicio.Estado.COMPLETADO)

    data = [serializar_solicitud_facturable(solicitud) for solicitud in solicitudes]
    return JsonResponse({"ok": True, "servicios": data, "total": len(data)})


@require_POST
def crear_factura(request):
    permiso = validar_admin_comun(request, "Solo el administrador puede generar facturas.")
    if permiso:
        return permiso

    datos, error = obtener_datos_request_comun(request)
    if error:
        return error

    solicitud_id = datos.get("solicitudId") or datos.get("solicitud_id")
    if not solicitud_id:
        return JsonResponse({"ok": False, "error": "Selecciona una orden completada."}, status=400)

    try:
        solicitud = SolicitudServicio.objects.select_related("cliente__usuario", "tecnico__usuario").get(id=solicitud_id)
    except SolicitudServicio.DoesNotExist:
        return JsonResponse({"ok": False, "error": "La orden seleccionada no existe."}, status=404)

    if solicitud.estado != SolicitudServicio.Estado.COMPLETADO:
        return JsonResponse({"ok": False, "error": "Solo se pueden facturar servicios completados."}, status=400)

    productos = datos.get("productos", [])
    if not isinstance(productos, list):
        return JsonResponse({"ok": False, "error": "Los repuestos deben enviarse como una lista."}, status=400)

    productos_limpios = []
    repuestos_monto = Decimal("0.00")
    try:
        servicio_monto = decimal_desde(datos.get("montoServicio", datos.get("servicio_monto", 0)), "El precio del servicio")
        for item in productos:
            nombre = str(item.get("producto") or item.get("nombre") or "").strip()
            cantidad = int(item.get("cantidad", 0))
            precio = decimal_desde(item.get("precio", 0), "El precio del repuesto")

            if not nombre or cantidad <= 0:
                return JsonResponse({"ok": False, "error": "Cada repuesto necesita nombre y cantidad válida."}, status=400)

            subtotal = (precio * cantidad).quantize(Decimal("0.01"))
            repuestos_monto += subtotal
            productos_limpios.append({
                "producto": nombre,
                "cantidad": cantidad,
                "precio": float(precio),
                "subtotal": float(subtotal),
            })
    except (ValueError, TypeError) as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=400)

    total = (servicio_monto + repuestos_monto).quantize(Decimal("0.01"))
    if total <= 0:
        return JsonResponse({"ok": False, "error": "La factura debe tener un total mayor que 0."}, status=400)

    metodo = METODOS_FRONT.get(datos.get("metodoPago", "Efectivo"), Factura.MetodoPago.EFECTIVO)
    estado = ESTADOS_FRONT.get(datos.get("estado", "Pagado"), Factura.Estado.PAGADO)
    garantia = str(datos.get("garantia", "30 Días")).strip() or "30 Días"

    try:
        with transaction.atomic():
            factura = Factura.objects.select_for_update().filter(solicitud=solicitud).first()
            if factura and factura.inventario_descontado:
                restaurar_stock_factura(factura)

            productos_inventario = resolver_productos_inventario(productos_limpios)
            descontar_stock(productos_inventario, solicitud, request.user)
            factura, _ = Factura.objects.update_or_create(
                solicitud=solicitud,
                defaults={
                    "servicio_monto": servicio_monto,
                    "repuestos_monto": repuestos_monto,
                    "total": total,
                    "metodo_pago": metodo,
                    "estado": estado,
                    "garantia": garantia,
                    "productos": productos_limpios,
                    "inventario_descontado": bool(productos_inventario),
                },
            )
    except ValueError as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=400)

    registrar_auditoria(request, "crear_o_actualizar", "facturacion", f"Factura {factura.numero} guardada.", factura.id)
    return JsonResponse({"ok": True, "factura": serializar_factura(factura)}, status=201)


@require_POST
def eliminar_factura(request, factura_id):
    permiso = validar_admin_comun(request, "Solo el administrador puede eliminar facturas.")
    if permiso:
        return permiso

    try:
        factura = Factura.objects.get(id=factura_id)
    except Factura.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Factura no encontrada."}, status=404)

    with transaction.atomic():
        factura = Factura.objects.select_for_update().get(id=factura_id)
        numero = factura.numero
        if factura.inventario_descontado:
            restaurar_stock_factura(factura)
        factura.delete()
    registrar_auditoria(request, "eliminar", "facturacion", f"Factura {numero} eliminada.", factura_id)
    return JsonResponse({"ok": True, "mensaje": "Factura eliminada correctamente."})
