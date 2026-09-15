import re

from django.db.models import Q
from django.utils import timezone

from apps.garantias.models import ReingresoGarantia
from apps.inventario.models import MovimientoInventario
from apps.servicios.models import HistorialSolicitud, SolicitudServicio
from apps.usuarios.models import RegistroAuditoria


ESTADOS = dict(SolicitudServicio.Estado.choices)
CODIGO_FACTURA_RE = re.compile(r"\bF-\d+\b")
CODIGO_ORDEN_RE = re.compile(r"\bSOL-\d+\b")


def _codigo_orden(solicitud_id, codigo=""):
    return codigo or (f"SOL-{solicitud_id:03d}" if solicitud_id else "Orden eliminada")


def _actor_desde_snapshot(nombre, username, rol):
    return {
        "nombre": nombre or username or "Sistema",
        "rol": rol or "sistema",
    }


def _actor_relacionado(fila, prefijo="usuario"):
    usuario_id = fila.get(f"{prefijo}_id")
    nombre = " ".join(filter(None, [
        fila.get(f"{prefijo}__first_name", ""),
        fila.get(f"{prefijo}__last_name", ""),
    ])).strip()
    if usuario_id:
        return {
            "nombre": nombre or fila.get(f"{prefijo}__username") or "Usuario",
            "rol": fila.get(f"{prefijo}__rol") or "",
        }
    return {"nombre": "Usuario eliminado", "rol": ""}


def _actividad(identificador, categoria, evento, titulo, descripcion, actor, referencia, fecha):
    return {
        "id": identificador,
        "categoria": categoria,
        "evento": evento,
        "titulo": titulo,
        "descripcion": descripcion,
        "actor": actor,
        "referencia": referencia,
        "_fecha": fecha,
    }


def _actividad_historial(fila):
    codigo = _codigo_orden(fila["solicitud_id"], fila["solicitud_codigo"])
    actor = _actor_desde_snapshot(
        fila["usuario_nombre"],
        fila["usuario_username"],
        fila["usuario_rol"],
    )
    sujeto = actor["nombre"]
    anterior = ESTADOS.get(fila["estado_anterior"], fila["estado_anterior"])
    nuevo = ESTADOS.get(fila["estado_nuevo"], fila["estado_nuevo"])
    tecnico_anterior = fila["tecnico_anterior_nombre"] or fila["tecnico_anterior_username"]
    tecnico_nuevo = fila["tecnico_nuevo_nombre"] or fila["tecnico_nuevo_username"]

    textos = {
        HistorialSolicitud.TipoEvento.CREACION: (
            f"{codigo} creada",
            "Se registró una nueva orden de servicio.",
        ),
        HistorialSolicitud.TipoEvento.ASIGNACION: (
            f"Técnico asignado a {codigo}" if tecnico_nuevo else f"Asignación retirada de {codigo}",
            (
                f"{tecnico_anterior or 'Sin asignar'} → {tecnico_nuevo or 'Sin asignar'}"
                if tecnico_anterior
                else f"Asignado a {tecnico_nuevo or 'Sin asignar'}."
            ),
        ),
        HistorialSolicitud.TipoEvento.INICIO: (
            f"{sujeto} inició {codigo}",
            "El trabajo de la orden fue iniciado.",
        ),
        HistorialSolicitud.TipoEvento.CAMBIO_ESTADO: (
            f"Estado actualizado en {codigo}",
            f"{anterior or 'Sin estado'} → {nuevo or 'Sin estado'}",
        ),
        HistorialSolicitud.TipoEvento.DIAGNOSTICO: (
            f"Diagnóstico actualizado en {codigo}",
            "Se registró información de diagnóstico.",
        ),
        HistorialSolicitud.TipoEvento.FINALIZACION: (
            f"{sujeto} finalizó {codigo}",
            "El servicio fue marcado como completado.",
        ),
        HistorialSolicitud.TipoEvento.CANCELACION: (
            f"{sujeto} canceló {codigo}",
            "La orden fue cancelada.",
        ),
        HistorialSolicitud.TipoEvento.GARANTIA_ACTIVADA: (
            f"Garantía activada en {codigo}",
            "La orden ahora cuenta con garantía.",
        ),
        HistorialSolicitud.TipoEvento.GARANTIA_ANULADA: (
            f"Garantía anulada en {codigo}",
            "La garantía asociada fue anulada.",
        ),
    }
    titulo, descripcion = textos.get(
        fila["accion"],
        (f"Actividad registrada en {codigo}", "Se actualizó la orden."),
    )
    return _actividad(
        f"orden-{fila['id']}",
        "orden",
        fila["accion"],
        titulo,
        descripcion,
        actor,
        {"tipo": "orden", "id": fila["solicitud_id"], "codigo": codigo},
        fila["creado_en"],
    )


def _actividades_historial(limite):
    filas = (
        HistorialSolicitud.objects
        .exclude(accion=HistorialSolicitud.TipoEvento.GARANTIA_UTILIZADA)
        .exclude(
            accion=HistorialSolicitud.TipoEvento.CREACION,
            solicitud__reingreso_garantia__isnull=False,
        )
        .values(
            "id",
            "solicitud_id",
            "solicitud_codigo",
            "usuario_username",
            "usuario_nombre",
            "usuario_rol",
            "tecnico_anterior_username",
            "tecnico_anterior_nombre",
            "tecnico_nuevo_username",
            "tecnico_nuevo_nombre",
            "accion",
            "estado_anterior",
            "estado_nuevo",
            "creado_en",
        )
        .order_by("-creado_en", "-id")[:limite]
    )
    return [_actividad_historial(fila) for fila in filas]


def _actividades_reingresos(limite):
    filas = (
        ReingresoGarantia.objects
        .values(
            "id",
            "garantia__solicitud_original_id",
            "solicitud_reingreso_id",
            "registrado_por_username",
            "registrado_por_nombre",
            "registrado_por_rol",
            "registrado_en",
        )
        .order_by("-registrado_en", "-id")[:limite]
    )
    actividades = []
    for fila in filas:
        original_id = fila["garantia__solicitud_original_id"]
        reingreso_id = fila["solicitud_reingreso_id"]
        original = _codigo_orden(original_id)
        reingreso = _codigo_orden(reingreso_id)
        actividades.append(_actividad(
            f"reingreso-{fila['id']}",
            "garantia",
            "reingreso_garantia",
            f"Reingreso por garantía: {reingreso}",
            f"Relacionado con la orden original {original}.",
            _actor_desde_snapshot(
                fila["registrado_por_nombre"],
                fila["registrado_por_username"],
                fila["registrado_por_rol"],
            ),
            {
                "tipo": "orden",
                "id": reingreso_id,
                "codigo": reingreso,
                "ordenOriginalId": original_id,
                "ordenOriginalCodigo": original,
            },
            fila["registrado_en"],
        ))
    return actividades


def _actor_movimiento(fila):
    if not fila["usuario_id"]:
        return {"nombre": "Sistema", "rol": "sistema"}
    return _actor_relacionado(fila)


def _actividades_inventario(limite):
    filas = (
        MovimientoInventario.objects
        .values(
            "id",
            "producto_id",
            "producto__codigo",
            "producto__nombre",
            "solicitud_id",
            "usuario_id",
            "usuario__username",
            "usuario__first_name",
            "usuario__last_name",
            "usuario__rol",
            "tipo",
            "cantidad",
            "stock_anterior",
            "stock_nuevo",
            "creado_en",
        )
        .order_by("-creado_en", "-id")[:limite]
    )
    actividades = []
    for fila in filas:
        producto = fila["producto__nombre"]
        codigo = fila["producto__codigo"]
        if fila["tipo"] == MovimientoInventario.Tipo.REGISTRO:
            evento = "inventario_registro"
            titulo = f"Stock de {producto} registrado"
        elif fila["tipo"] == MovimientoInventario.Tipo.SALIDA:
            evento = "inventario_salida"
            titulo = f"Stock de {producto} utilizado"
        elif fila["usuario_id"] is None and fila["solicitud_id"] and fila["cantidad"] > 0:
            evento = "inventario_restauracion"
            titulo = f"Stock de {producto} restaurado"
        else:
            evento = "inventario_ajuste"
            titulo = f"Stock de {producto} actualizado"

        descripcion = f"Existencias: {fila['stock_anterior']} → {fila['stock_nuevo']}."
        if fila["solicitud_id"]:
            descripcion += f" Orden {_codigo_orden(fila['solicitud_id'])}."
        actividades.append(_actividad(
            f"inventario-{fila['id']}",
            "inventario",
            evento,
            titulo,
            descripcion,
            _actor_movimiento(fila),
            {"tipo": "inventario", "id": fila["producto_id"], "codigo": codigo},
            fila["creado_en"],
        ))
    return actividades


def _codigo_descripcion(descripcion, patron, respaldo):
    coincidencia = patron.search(descripcion or "")
    return coincidencia.group(0) if coincidencia else respaldo


def _actividad_auditoria(fila):
    modulo = fila["modulo"]
    accion = fila["accion"]
    objeto_id = int(fila["objeto_id"]) if str(fila["objeto_id"]).isdecimal() else None
    actor = _actor_relacionado(fila)

    if modulo == "facturacion":
        codigo = _codigo_descripcion(fila["descripcion"], CODIGO_FACTURA_RE, "Factura")
        eliminado = accion == "eliminar"
        return _actividad(
            f"auditoria-{fila['id']}",
            "facturacion",
            "factura_eliminada" if eliminado else "factura_guardada",
            "Factura eliminada" if eliminado else "Factura guardada",
            f"Se eliminó {codigo}." if eliminado else f"Se guardó {codigo} correctamente.",
            actor,
            {"tipo": "factura", "id": objeto_id, "codigo": codigo},
            fila["creado_en"],
        )

    if modulo == "soporte":
        codigo = f"TK-{objeto_id:03d}" if objeto_id else "Ticket"
        respondido = accion == "responder"
        return _actividad(
            f"auditoria-{fila['id']}",
            "soporte",
            "ticket_respondido" if respondido else "ticket_creado",
            f"{codigo} respondido" if respondido else f"{codigo} creado",
            "Se respondió un ticket de soporte." if respondido else "Se registró un ticket de soporte.",
            actor,
            {"tipo": "soporte", "id": objeto_id, "codigo": codigo},
            fila["creado_en"],
        )

    codigo = _codigo_descripcion(
        fila["descripcion"],
        CODIGO_ORDEN_RE,
        _codigo_orden(objeto_id),
    )
    return _actividad(
        f"auditoria-{fila['id']}",
        "orden",
        "orden_eliminada",
        f"{codigo} eliminada",
        "La orden fue eliminada del sistema.",
        actor,
        {"tipo": "orden", "id": None, "codigo": codigo},
        fila["creado_en"],
    )


def _actividades_auditoria(limite):
    filtros = (
        Q(modulo="facturacion", accion__in=["crear_o_actualizar", "eliminar"])
        | Q(modulo="soporte", accion__in=["crear", "responder"])
        | Q(modulo="servicios", accion="eliminar")
    )
    filas = (
        RegistroAuditoria.objects
        .filter(filtros)
        .values(
            "id",
            "usuario_id",
            "usuario__username",
            "usuario__first_name",
            "usuario__last_name",
            "usuario__rol",
            "accion",
            "modulo",
            "objeto_id",
            "descripcion",
            "creado_en",
        )
        .order_by("-creado_en", "-id")[:limite]
    )
    return [_actividad_auditoria(fila) for fila in filas]


def obtener_actividad_reciente(limite=10):
    actividades = [
        *_actividades_historial(limite),
        *_actividades_reingresos(limite),
        *_actividades_inventario(limite),
        *_actividades_auditoria(limite),
    ]
    actividades.sort(key=lambda item: (item["_fecha"], item["id"]), reverse=True)

    resultado = []
    for actividad in actividades[:limite]:
        fecha = actividad.pop("_fecha")
        actividad["creadoEn"] = timezone.localtime(fecha).isoformat()
        resultado.append(actividad)
    return resultado
