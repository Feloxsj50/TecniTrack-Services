from .models import Garantia, ReingresoGarantia


class NivelDetalleGarantia:
    ADMIN = "admin"
    TECNICO = "tecnico"
    CLIENTE = "cliente"


def _actor(prefijo, objeto):
    return {
        "id": getattr(objeto, f"{prefijo}_id"),
        "username": getattr(objeto, f"{prefijo}_username"),
        "nombre": getattr(objeto, f"{prefijo}_nombre"),
        "rol": getattr(objeto, f"{prefijo}_rol"),
    }


def _codigo(solicitud):
    return f"SOL-{solicitud.id:03d}"


def serializar_garantia(garantia, nivel=NivelDetalleGarantia.CLIENTE):
    try:
        reingreso = garantia.reingreso
    except ReingresoGarantia.DoesNotExist:
        reingreso = None

    estado = garantia.estado_actual
    datos = {
        "id": garantia.id,
        "estado": estado,
        "estadoNombre": dict(Garantia.Estado.choices)[estado],
        "duracionDias": garantia.duracion_dias,
        "fechaInicio": garantia.fecha_inicio.isoformat(),
        "fechaVencimiento": garantia.fecha_vencimiento.isoformat(),
        "diasRestantes": garantia.dias_restantes,
        "condicionesPublicas": garantia.condiciones_publicas,
        "ordenOriginal": {
            "id": garantia.solicitud_original_id,
            "codigo": _codigo(garantia.solicitud_original),
        },
        "creadaEn": garantia.creado_en.isoformat(),
        "anuladaEn": garantia.anulada_en.isoformat() if garantia.anulada_en else None,
        "reingreso": None,
    }
    if reingreso:
        solicitud = reingreso.solicitud_reingreso
        datos["reingreso"] = {
            "id": reingreso.id,
            "motivo": reingreso.motivo,
            "registradoEn": reingreso.registrado_en.isoformat(),
            "orden": {
                "id": solicitud.id,
                "codigo": _codigo(solicitud),
                "estado": solicitud.estado,
                "estadoNombre": solicitud.get_estado_display(),
            },
        }

    if nivel == NivelDetalleGarantia.ADMIN:
        datos.update({
            "notasInternas": garantia.notas_internas,
            "creadaPor": _actor("creada_por", garantia),
            "motivoAnulacion": garantia.motivo_anulacion,
            "anuladaPor": _actor("anulada_por", garantia) if garantia.anulada_en else None,
        })
        if reingreso:
            datos["reingreso"].update({
                "observacionesInternas": reingreso.observaciones_internas,
                "registradoPor": _actor("registrado_por", reingreso),
            })
    return datos
