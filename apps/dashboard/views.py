from collections import Counter, defaultdict
from decimal import Decimal

from django.http import JsonResponse
from django.views.decorators.http import require_GET

from apps.clientes.models import Cliente
from apps.facturacion.models import Factura
from apps.servicios.models import SolicitudServicio
from apps.usuarios.models import Usuario


def moneda_decimal(valor):
    return float((valor or Decimal("0")).quantize(Decimal("0.01")))


@require_GET
def reportes(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    if request.user.rol != Usuario.Rol.ADMIN:
        return JsonResponse({"ok": False, "error": "Solo admin puede consultar reportes."}, status=403)

    facturas = Factura.objects.select_related(
        "solicitud__cliente__usuario",
        "solicitud__tecnico__usuario",
    )
    solicitudes = SolicitudServicio.objects.select_related("cliente__usuario", "tecnico__usuario")
    clientes_total = Cliente.objects.count()

    ingresos_pagados = Decimal("0.00")
    pagos_pendientes = Decimal("0.00")
    metodos = defaultdict(Decimal)
    ingresos_por_dia = defaultdict(Decimal)
    ventas_semanales = [Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), Decimal("0.00")]
    clientes_atendidos = set()
    exportacion = []
    estados_ordenes = Counter(solicitud.get_estado_display() for solicitud in solicitudes)
    tecnicos_ordenes = Counter(
        solicitud.tecnico.usuario.get_full_name() or solicitud.tecnico.usuario.username
        for solicitud in solicitudes
        if solicitud.tecnico
    )
    inventario_usado = Counter()

    for factura in facturas:
        total = factura.total or Decimal("0.00")
        if factura.estado == Factura.Estado.PAGADO:
            ingresos_pagados += total
        elif factura.estado == Factura.Estado.PENDIENTE:
            pagos_pendientes += total

        metodo = factura.get_metodo_pago_display()
        metodos[metodo] += total

        dia = factura.fecha.strftime("%d")
        ingresos_por_dia[dia] += total

        semana = min(3, max(0, (factura.fecha.day - 1) // 7))
        ventas_semanales[semana] += total

        cliente = factura.solicitud.cliente
        if cliente_id := getattr(cliente, "id", None):
            clientes_atendidos.add(cliente_id)

        exportacion.append({
            "numero": factura.numero,
            "fecha": factura.fecha.isoformat(),
            "cliente": factura.solicitud.cliente.usuario.get_full_name() if factura.solicitud.cliente else factura.solicitud.cliente_nombre,
            "servicio": factura.solicitud.problema,
            "metodoPago": metodo,
            "estado": factura.get_estado_display(),
            "total": moneda_decimal(total),
        })
        for producto in factura.productos or []:
            nombre = producto.get("producto") or producto.get("nombre") or "Repuesto"
            inventario_usado[nombre] += int(producto.get("cantidad", 0) or 0)

    servicios_counter = Counter(solicitud.problema or "Sin servicio" for solicitud in solicitudes)
    top_servicios = servicios_counter.most_common(5) or [("Sin datos", 0)]

    data = {
        "cards": {
            "ingresos": moneda_decimal(ingresos_pagados),
            "facturas": facturas.count(),
            "pendientes": moneda_decimal(pagos_pendientes),
            "clientes": len(clientes_atendidos) or clientes_total,
        },
        "graficos": {
            "ventasSemanales": {
                "labels": ["Semana 1", "Semana 2", "Semana 3", "Semana 4"],
                "data": [moneda_decimal(valor) for valor in ventas_semanales],
            },
            "metodosPago": {
                "labels": list(metodos.keys()) or ["Sin datos"],
                "data": [moneda_decimal(valor) for valor in metodos.values()] or [0],
            },
            "ingresosDia": {
                "labels": list(sorted(ingresos_por_dia.keys(), key=int)) or ["0"],
                "data": [moneda_decimal(ingresos_por_dia[dia]) for dia in sorted(ingresos_por_dia.keys(), key=int)] or [0],
            },
            "servicios": {
                "labels": [item[0] for item in top_servicios],
                "data": [item[1] for item in top_servicios],
            },
            "ordenes": {
                "labels": ["Pendientes", "En proceso", "Completadas", "Canceladas"],
                "data": [
                    estados_ordenes.get("Pendiente", 0),
                    estados_ordenes.get("En proceso", 0),
                    estados_ordenes.get("Completado", 0),
                    estados_ordenes.get("Cancelado", 0),
                ],
            },
            "tecnicos": {
                "labels": list(tecnicos_ordenes.keys()) or ["Sin datos"],
                "data": list(tecnicos_ordenes.values()) or [0],
            },
            "inventario": {
                "labels": list(inventario_usado.keys()) or ["Sin datos"],
                "data": list(inventario_usado.values()) or [0],
            },
        },
        "ordenes": {
            "total": solicitudes.count(),
            "pendientes": estados_ordenes.get("Pendiente", 0),
            "enProceso": estados_ordenes.get("En proceso", 0),
            "completadas": estados_ordenes.get("Completado", 0),
            "canceladas": estados_ordenes.get("Cancelado", 0),
            "tecnicos": {
                "labels": list(tecnicos_ordenes.keys()) or ["Sin datos"],
                "data": list(tecnicos_ordenes.values()) or [0],
            },
        },
        "exportacion": exportacion,
    }

    return JsonResponse({"ok": True, "reporte": data})
