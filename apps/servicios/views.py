import json

from django.http import JsonResponse
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_GET, require_POST

from apps.clientes.models import Cliente
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Notificacion, Usuario
from apps.usuarios.auditoria import registrar_auditoria
from apps.usuarios.api import obtener_datos_request as obtener_datos_request_comun
from .models import SolicitudServicio
from .history import registrar_cambio_solicitud


ESTADOS_FRONT = {
    "Pendiente": SolicitudServicio.Estado.PENDIENTE,
    "En Proceso": SolicitudServicio.Estado.EN_PROCESO,
    "En proceso": SolicitudServicio.Estado.EN_PROCESO,
    "Completado": SolicitudServicio.Estado.COMPLETADO,
    "Cancelado": SolicitudServicio.Estado.CANCELADO,
}

PRIORIDADES_FRONT = {
    "Baja": SolicitudServicio.Prioridad.BAJA,
    "Media": SolicitudServicio.Prioridad.MEDIA,
    "Alta": SolicitudServicio.Prioridad.ALTA,
}


def obtener_datos_request(request):
    if request.content_type and request.content_type.startswith("application/json"):
        try:
            return json.loads(request.body.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, JsonResponse({"ok": False, "error": "Datos inválidos."}, status=400)

    return request.POST, None


def fecha_db(valor):
    if not valor:
        return None
    if hasattr(valor, "isoformat"):
        return valor
    return parse_date(str(valor))


def fecha_iso(valor):
    if not valor:
        return ""
    if hasattr(valor, "isoformat"):
        return valor.isoformat()
    return str(valor)


def estado_db(valor):
    return ESTADOS_FRONT.get(valor, SolicitudServicio.Estado.PENDIENTE)


def prioridad_db(valor):
    return PRIORIDADES_FRONT.get(valor, SolicitudServicio.Prioridad.MEDIA)


def nombre_cliente_visible(solicitud):
    if solicitud.cliente:
        return solicitud.cliente.usuario.get_full_name() or solicitud.cliente.usuario.username
    return solicitud.cliente_nombre or "Cliente sin cuenta"


def serializar_solicitud(solicitud):
    tecnico = solicitud.tecnico
    tecnico_usuario = tecnico.usuario.username if tecnico else ""
    tecnico_nombre = tecnico.usuario.get_full_name() if tecnico else ""
    usuario_cliente = solicitud.cliente.usuario.username if solicitud.cliente else ""

    return {
        "id": f"SOL-{solicitud.id:03d}",
        "dbId": solicitud.id,
        "fecha": fecha_iso(solicitud.fecha_preferida),
        "cliente": nombre_cliente_visible(solicitud),
        "usuarioCliente": usuario_cliente,
        "dispositivo": solicitud.dispositivo,
        "servicio": solicitud.problema,
        "tecnico": tecnico_usuario,
        "tecnicoNombre": tecnico_nombre or tecnico_usuario,
        "diagnostico": solicitud.diagnostico,
        "repuesto": solicitud.repuesto_usado,
        "prioridad": solicitud.get_prioridad_display(),
        "estado": solicitud.get_estado_display(),
        "creadoEn": solicitud.creado_en.isoformat(),
        "actualizadoEn": solicitud.actualizado_en.isoformat(),
        "facturada": hasattr(solicitud, "factura"),
    }


def queryset_por_rol(usuario):
    solicitudes = SolicitudServicio.objects.select_related(
        "cliente__usuario",
        "tecnico__usuario",
    )

    if usuario.rol == Usuario.Rol.ADMIN:
        return solicitudes

    if usuario.rol == Usuario.Rol.CLIENTE and hasattr(usuario, "perfil_cliente"):
        return solicitudes.filter(cliente=usuario.perfil_cliente)

    if usuario.rol == Usuario.Rol.TECNICO and hasattr(usuario, "perfil_tecnico"):
        return solicitudes.filter(tecnico=usuario.perfil_tecnico)

    return solicitudes.none()


def buscar_cliente(valor):
    valor = valor.strip()
    if not valor:
        return None

    clientes = Cliente.objects.select_related("usuario")
    for cliente in clientes:
        usuario = cliente.usuario
        nombre = usuario.get_full_name() or usuario.username
        opciones = {usuario.username.lower(), usuario.email.lower(), nombre.lower()}
        if valor.lower() in opciones:
            return cliente
    return None


def buscar_cliente_por_id(valor):
    if not valor:
        return None

    try:
        cliente_id = int(valor)
    except (TypeError, ValueError):
        return None

    return Cliente.objects.select_related("usuario").filter(id=cliente_id).first()


def buscar_tecnico(username):
    username = username.strip()
    if not username:
        return None
    return Tecnico.objects.select_related("usuario").filter(
        usuario__username__iexact=username,
        usuario__activo=True,
        estado=Tecnico.Estado.ACTIVO,
    ).first()


def notificar_usuarios(usuarios, titulo, mensaje, url):
    Notificacion.objects.bulk_create([
        Notificacion(usuario=usuario, titulo=titulo, mensaje=mensaje, url=url)
        for usuario in usuarios if usuario and usuario.activo
    ])


@require_GET
def listar_solicitudes(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    solicitudes = [serializar_solicitud(solicitud) for solicitud in queryset_por_rol(request.user)]
    return JsonResponse({"ok": True, "solicitudes": solicitudes, "total": len(solicitudes)})


@require_POST
def crear_solicitud(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    datos, error = obtener_datos_request_comun(request)
    if error:
        return error

    dispositivo = datos.get("dispositivo", "").strip()
    problema = datos.get("servicio", datos.get("problema", "")).strip()
    fecha = fecha_db(datos.get("fecha", datos.get("fecha_preferida", "")))
    prioridad = prioridad_db(datos.get("prioridad", "Media"))
    estado = estado_db(datos.get("estado", "Pendiente"))
    tecnico = buscar_tecnico(datos.get("tecnico", ""))
    cliente_nombre = ""

    if request.user.rol == Usuario.Rol.CLIENTE and hasattr(request.user, "perfil_cliente"):
        cliente = request.user.perfil_cliente
        cliente_nombre = request.user.get_full_name() or request.user.username
        estado = SolicitudServicio.Estado.PENDIENTE
        tecnico = None
    elif request.user.rol == Usuario.Rol.ADMIN:
        cliente_nombre = datos.get("cliente", "").strip()
        cliente = buscar_cliente_por_id(datos.get("clienteId")) or buscar_cliente(cliente_nombre)
        if tecnico and estado == SolicitudServicio.Estado.PENDIENTE:
            estado = SolicitudServicio.Estado.EN_PROCESO
    else:
        return JsonResponse({"ok": False, "error": "No tienes permiso para crear solicitudes."}, status=403)

    if not all([cliente_nombre, dispositivo, problema, fecha]):
        return JsonResponse({"ok": False, "error": "Completa cliente, dispositivo, servicio y fecha."}, status=400)

    solicitud = SolicitudServicio.objects.create(
        cliente=cliente,
        cliente_nombre="" if cliente else cliente_nombre,
        tecnico=tecnico,
        dispositivo=dispositivo,
        problema=problema,
        fecha_preferida=fecha,
        prioridad=prioridad,
        estado=estado,
    )
    solicitud.refresh_from_db()
    registrar_cambio_solicitud(
        solicitud,
        request.user,
        "creacion",
        estado_nuevo=solicitud.estado,
        detalle=f"Orden creada para {solicitud.dispositivo}: {solicitud.problema}.",
    )
    registrar_auditoria(
        request,
        "crear",
        "servicios",
        f"Orden SOL-{solicitud.id:03d} creada.",
        solicitud.id,
    )

    if solicitud.tecnico:
        notificar_usuarios(
            [solicitud.tecnico.usuario],
            "Nuevo trabajo asignado",
            f"La orden SOL-{solicitud.id:03d} fue asignada a tu panel.",
            "tecnico/panel_tecnico.html",
        )
    else:
        notificar_usuarios(
            Usuario.objects.filter(rol=Usuario.Rol.ADMIN, activo=True),
            "Nueva solicitud de servicio",
            f"Se recibió la orden SOL-{solicitud.id:03d}.",
            "admin/panel_admin.html",
        )

    return JsonResponse({"ok": True, "solicitud": serializar_solicitud(solicitud)}, status=201)


@require_POST
def actualizar_solicitud(request, solicitud_id):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    try:
        solicitud = SolicitudServicio.objects.select_related("cliente__usuario", "tecnico__usuario").get(id=solicitud_id)
    except SolicitudServicio.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Solicitud no encontrada."}, status=404)

    datos, error = obtener_datos_request_comun(request)
    if error:
        return error

    estado_anterior = solicitud.estado
    tecnico_anterior = solicitud.tecnico_id
    diagnostico_anterior = solicitud.diagnostico
    repuesto_anterior = solicitud.repuesto_usado

    if request.user.rol == Usuario.Rol.ADMIN:
        cliente_nombre = datos.get("cliente", "").strip()
        cliente = buscar_cliente_por_id(datos.get("clienteId")) or buscar_cliente(cliente_nombre)

        solicitud.cliente = cliente
        solicitud.cliente_nombre = "" if cliente else cliente_nombre
        solicitud.dispositivo = datos.get("dispositivo", solicitud.dispositivo).strip()
        solicitud.problema = datos.get("servicio", solicitud.problema).strip()
        solicitud.fecha_preferida = fecha_db(datos.get("fecha", solicitud.fecha_preferida))
        solicitud.tecnico = buscar_tecnico(datos.get("tecnico", ""))
        solicitud.prioridad = prioridad_db(datos.get("prioridad", solicitud.get_prioridad_display()))
        solicitud.estado = estado_db(datos.get("estado", solicitud.get_estado_display()))
        if solicitud.tecnico and solicitud.estado == SolicitudServicio.Estado.PENDIENTE:
            solicitud.estado = SolicitudServicio.Estado.EN_PROCESO
        if solicitud.estado in [SolicitudServicio.Estado.EN_PROCESO, SolicitudServicio.Estado.COMPLETADO] and not solicitud.tecnico:
            return JsonResponse({"ok": False, "error": "Asigna un técnico antes de iniciar o completar la orden."}, status=400)
    elif request.user.rol == Usuario.Rol.TECNICO and hasattr(request.user, "perfil_tecnico") and solicitud.tecnico_id == request.user.perfil_tecnico.id:
        if solicitud.estado in [SolicitudServicio.Estado.COMPLETADO, SolicitudServicio.Estado.CANCELADO]:
            return JsonResponse({"ok": False, "error": "Esta orden ya no puede ser modificada."}, status=400)
        diagnostico = datos.get("diagnostico", "").strip()
        estado = estado_db(datos.get("estado", solicitud.get_estado_display()))
        if estado == SolicitudServicio.Estado.PENDIENTE:
            return JsonResponse({"ok": False, "error": "Un trabajo asignado debe estar en proceso o completado."}, status=400)

        if estado == SolicitudServicio.Estado.COMPLETADO and len(diagnostico) < 10:
            return JsonResponse({"ok": False, "error": "Para completar el trabajo, agrega un diagnostico claro."}, status=400)

        solicitud.diagnostico = diagnostico
        solicitud.repuesto_usado = datos.get("repuesto", "").strip()
        solicitud.estado = estado
    else:
        return JsonResponse({"ok": False, "error": "No tienes permiso para actualizar esta solicitud."}, status=403)

    solicitud.save()
    solicitud.refresh_from_db()
    if (
        estado_anterior != solicitud.estado
        or tecnico_anterior != solicitud.tecnico_id
        or diagnostico_anterior != solicitud.diagnostico
        or repuesto_anterior != solicitud.repuesto_usado
    ):
        registrar_cambio_solicitud(
            solicitud,
            request.user,
            "actualizacion",
            estado_anterior=estado_anterior,
            estado_nuevo=solicitud.estado,
            detalle=(
                f"Técnico: {solicitud.tecnico.usuario.username if solicitud.tecnico else 'Sin asignar'}. "
                f"Diagnóstico: {solicitud.diagnostico or 'Pendiente'}. "
                f"Repuesto: {solicitud.repuesto_usado or 'Ninguno'}."
            ),
        )
    registrar_auditoria(
        request,
        "actualizar",
        "servicios",
        f"Orden SOL-{solicitud.id:03d} actualizada a {solicitud.get_estado_display()}.",
        solicitud.id,
    )
    if request.user.rol == Usuario.Rol.ADMIN and solicitud.tecnico_id and solicitud.tecnico_id != tecnico_anterior:
        notificar_usuarios(
            [solicitud.tecnico.usuario],
            "Trabajo actualizado",
            f"La orden SOL-{solicitud.id:03d} está asignada a tu panel.",
            "tecnico/panel_tecnico.html",
        )
    if solicitud.cliente and solicitud.estado != estado_anterior:
        notificar_usuarios(
            [solicitud.cliente.usuario],
            "Estado de servicio actualizado",
            f"La orden SOL-{solicitud.id:03d} ahora está en {solicitud.get_estado_display()}.",
            "cliente/panel_cliente.html",
        )
    return JsonResponse({"ok": True, "solicitud": serializar_solicitud(solicitud)})


@require_POST
def eliminar_solicitud(request, solicitud_id):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    if request.user.rol != Usuario.Rol.ADMIN:
        return JsonResponse({"ok": False, "error": "Solo admin puede eliminar órdenes."}, status=403)

    try:
        solicitud = SolicitudServicio.objects.get(id=solicitud_id)
    except SolicitudServicio.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Solicitud no encontrada."}, status=404)

    if hasattr(solicitud, "factura"):
        return JsonResponse(
            {"ok": False, "error": "No se puede eliminar una orden facturada. Conserva ese registro para el historial."},
            status=400,
        )

    registrar_auditoria(request, "eliminar", "servicios", f"Orden SOL-{solicitud.id:03d} eliminada.", solicitud.id)
    registrar_cambio_solicitud(
        solicitud,
        request.user,
        "eliminacion",
        estado_anterior=solicitud.estado,
        detalle="La orden fue eliminada por el administrador.",
    )
    solicitud.delete()
    return JsonResponse({"ok": True})


@require_GET
def historial_solicitud(request, solicitud_id):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    solicitud = SolicitudServicio.objects.filter(id=solicitud_id).first()
    if not solicitud:
        return JsonResponse({"ok": False, "error": "Solicitud no encontrada."}, status=404)

    puede_ver = request.user.rol == Usuario.Rol.ADMIN
    puede_ver = puede_ver or (
        request.user.rol == Usuario.Rol.CLIENTE
        and getattr(request.user, "perfil_cliente", None)
        and solicitud.cliente_id == request.user.perfil_cliente.id
    )
    puede_ver = puede_ver or (
        request.user.rol == Usuario.Rol.TECNICO
        and getattr(request.user, "perfil_tecnico", None)
        and solicitud.tecnico_id == request.user.perfil_tecnico.id
    )
    if not puede_ver:
        return JsonResponse({"ok": False, "error": "No tienes permiso para ver este historial."}, status=403)

    return JsonResponse({
        "ok": True,
        "historial": [{
            "accion": cambio.accion,
            "estadoAnterior": cambio.estado_anterior,
            "estadoNuevo": cambio.estado_nuevo,
            "detalle": cambio.detalle,
            "usuario": cambio.usuario.username if cambio.usuario else "Sistema",
            "fecha": cambio.creado_en.isoformat(),
        } for cambio in solicitud.historial.select_related("usuario")],
    })
