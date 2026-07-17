from .models import HistorialSolicitud


def registrar_cambio_solicitud(
    solicitud, usuario, accion, estado_anterior="", estado_nuevo="", detalle=""
):
    return HistorialSolicitud.objects.create(
        solicitud=solicitud,
        usuario=usuario if getattr(usuario, "is_authenticated", False) else None,
        accion=accion,
        estado_anterior=estado_anterior or "",
        estado_nuevo=estado_nuevo or "",
        detalle=detalle,
    )
