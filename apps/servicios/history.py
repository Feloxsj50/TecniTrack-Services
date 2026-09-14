from .models import HistorialSolicitud, SolicitudServicio


def _datos_usuario(usuario):
    if not usuario or not getattr(usuario, "is_authenticated", False):
        return None, "", "Sistema", "sistema"

    nombre = usuario.get_full_name() or usuario.username
    return usuario, usuario.username, nombre, usuario.rol


def _datos_tecnico(tecnico):
    if not tecnico:
        return "", ""
    usuario = tecnico.usuario
    return usuario.username, usuario.get_full_name() or usuario.username


def _estado_visible(estado):
    return dict(SolicitudServicio.Estado.choices).get(estado, estado or "Sin estado")


def registrar_evento(
    solicitud,
    usuario,
    accion,
    descripcion,
    visibilidad=HistorialSolicitud.Visibilidad.PUBLICO,
    estado_anterior="",
    estado_nuevo="",
    tecnico_anterior=None,
    tecnico_nuevo=None,
):
    actor, actor_username, actor_nombre, actor_rol = _datos_usuario(usuario)
    tecnico_anterior_username, tecnico_anterior_nombre = _datos_tecnico(tecnico_anterior)
    tecnico_nuevo_username, tecnico_nuevo_nombre = _datos_tecnico(tecnico_nuevo)

    return HistorialSolicitud.objects.create(
        solicitud=solicitud,
        solicitud_codigo=f"SOL-{solicitud.id:03d}",
        usuario=actor,
        usuario_username=actor_username,
        usuario_nombre=actor_nombre,
        usuario_rol=actor_rol,
        tecnico_anterior=tecnico_anterior,
        tecnico_anterior_username=tecnico_anterior_username,
        tecnico_anterior_nombre=tecnico_anterior_nombre,
        tecnico_nuevo=tecnico_nuevo,
        tecnico_nuevo_username=tecnico_nuevo_username,
        tecnico_nuevo_nombre=tecnico_nuevo_nombre,
        accion=accion,
        estado_anterior=estado_anterior or "",
        estado_nuevo=estado_nuevo or "",
        descripcion=descripcion,
        visibilidad=visibilidad,
    )


def registrar_creacion(solicitud, usuario):
    return registrar_evento(
        solicitud,
        usuario,
        HistorialSolicitud.TipoEvento.CREACION,
        f"Orden creada para {solicitud.dispositivo}: {solicitud.problema}.",
        estado_nuevo=solicitud.estado,
    )


def registrar_asignacion(solicitud, usuario, tecnico_anterior, tecnico_nuevo):
    anterior = _datos_tecnico(tecnico_anterior)[1]
    nuevo = _datos_tecnico(tecnico_nuevo)[1]
    if tecnico_anterior and tecnico_nuevo:
        descripcion = f"La orden fue reasignada de {anterior} a {nuevo}."
    elif tecnico_nuevo:
        descripcion = f"La orden fue asignada a {nuevo}."
    else:
        descripcion = f"Se retiró la asignación de {anterior}."

    return registrar_evento(
        solicitud,
        usuario,
        HistorialSolicitud.TipoEvento.ASIGNACION,
        descripcion,
        tecnico_anterior=tecnico_anterior,
        tecnico_nuevo=tecnico_nuevo,
    )


def registrar_inicio(solicitud, usuario, estado_anterior):
    return registrar_evento(
        solicitud,
        usuario,
        HistorialSolicitud.TipoEvento.INICIO,
        "El servicio fue iniciado.",
        estado_anterior=estado_anterior,
        estado_nuevo=solicitud.estado,
    )


def registrar_cambio_estado(solicitud, usuario, estado_anterior):
    return registrar_evento(
        solicitud,
        usuario,
        HistorialSolicitud.TipoEvento.CAMBIO_ESTADO,
        f"El estado cambió de {_estado_visible(estado_anterior)} a {_estado_visible(solicitud.estado)}.",
        estado_anterior=estado_anterior,
        estado_nuevo=solicitud.estado,
    )


def registrar_diagnostico(solicitud, usuario):
    diagnostico = solicitud.diagnostico or "Sin diagnóstico"
    repuesto = solicitud.repuesto_usado or "Ninguno"
    return registrar_evento(
        solicitud,
        usuario,
        HistorialSolicitud.TipoEvento.DIAGNOSTICO,
        f"Diagnóstico: {diagnostico}. Repuesto: {repuesto}.",
        HistorialSolicitud.Visibilidad.INTERNO,
    )


def registrar_finalizacion(solicitud, usuario, estado_anterior):
    return registrar_evento(
        solicitud,
        usuario,
        HistorialSolicitud.TipoEvento.FINALIZACION,
        "El servicio fue finalizado.",
        estado_anterior=estado_anterior,
        estado_nuevo=solicitud.estado,
    )


def registrar_cancelacion(solicitud, usuario, estado_anterior):
    return registrar_evento(
        solicitud,
        usuario,
        HistorialSolicitud.TipoEvento.CANCELACION,
        "La orden fue cancelada.",
        estado_anterior=estado_anterior,
        estado_nuevo=solicitud.estado,
    )


def registrar_garantia_activada(solicitud, usuario, garantia):
    return registrar_evento(
        solicitud,
        usuario,
        HistorialSolicitud.TipoEvento.GARANTIA_ACTIVADA,
        (
            "La garantía fue activada desde el "
            f"{garantia.fecha_inicio:%d/%m/%Y} hasta el "
            f"{garantia.fecha_vencimiento:%d/%m/%Y}."
        ),
    )


def registrar_garantia_utilizada(solicitud, solicitud_relacionada, usuario, motivo):
    return registrar_evento(
        solicitud,
        usuario,
        HistorialSolicitud.TipoEvento.GARANTIA_UTILIZADA,
        (
            "Se registró un reingreso por garantía relacionado con "
            f"SOL-{solicitud_relacionada.id:03d}. Motivo: {motivo}"
        ),
    )


def registrar_garantia_anulada(solicitud, usuario):
    return registrar_evento(
        solicitud,
        usuario,
        HistorialSolicitud.TipoEvento.GARANTIA_ANULADA,
        "La garantía de la orden fue anulada.",
    )
