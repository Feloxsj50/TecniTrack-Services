import json

from django.http import JsonResponse
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_GET, require_POST

from apps.clientes.models import Cliente
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Usuario
from .models import SolicitudServicio


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
            return None, JsonResponse({"ok": False, "error": "Datos invalidos."}, status=400)

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


def buscar_tecnico(username):
    username = username.strip()
    if not username:
        return None
    return Tecnico.objects.select_related("usuario").filter(usuario__username__iexact=username).first()


@require_GET
def listar_solicitudes(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesion activa."}, status=401)

    solicitudes = [serializar_solicitud(solicitud) for solicitud in queryset_por_rol(request.user)]
    return JsonResponse({"ok": True, "solicitudes": solicitudes, "total": len(solicitudes)})


@require_POST
def crear_solicitud(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesion activa."}, status=401)

    datos, error = obtener_datos_request(request)
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
        cliente = buscar_cliente(cliente_nombre)
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

    return JsonResponse({"ok": True, "solicitud": serializar_solicitud(solicitud)}, status=201)


@require_POST
def actualizar_solicitud(request, solicitud_id):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesion activa."}, status=401)

    try:
        solicitud = SolicitudServicio.objects.select_related("cliente__usuario", "tecnico__usuario").get(id=solicitud_id)
    except SolicitudServicio.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Solicitud no encontrada."}, status=404)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    if request.user.rol == Usuario.Rol.ADMIN:
        cliente_nombre = datos.get("cliente", "").strip()
        cliente = buscar_cliente(cliente_nombre)

        solicitud.cliente = cliente
        solicitud.cliente_nombre = "" if cliente else cliente_nombre
        solicitud.dispositivo = datos.get("dispositivo", solicitud.dispositivo).strip()
        solicitud.problema = datos.get("servicio", solicitud.problema).strip()
        solicitud.fecha_preferida = fecha_db(datos.get("fecha", solicitud.fecha_preferida))
        solicitud.tecnico = buscar_tecnico(datos.get("tecnico", ""))
        solicitud.prioridad = prioridad_db(datos.get("prioridad", solicitud.get_prioridad_display()))
        solicitud.estado = estado_db(datos.get("estado", solicitud.get_estado_display()))
    elif request.user.rol == Usuario.Rol.TECNICO and hasattr(request.user, "perfil_tecnico") and solicitud.tecnico_id == request.user.perfil_tecnico.id:
        diagnostico = datos.get("diagnostico", "").strip()
        estado = estado_db(datos.get("estado", solicitud.get_estado_display()))

        if estado == SolicitudServicio.Estado.COMPLETADO and len(diagnostico) < 10:
            return JsonResponse({"ok": False, "error": "Para completar el trabajo, agrega un diagnostico claro."}, status=400)

        solicitud.diagnostico = diagnostico
        solicitud.repuesto_usado = datos.get("repuesto", "").strip()
        solicitud.estado = estado
    else:
        return JsonResponse({"ok": False, "error": "No tienes permiso para actualizar esta solicitud."}, status=403)

    solicitud.save()
    solicitud.refresh_from_db()
    return JsonResponse({"ok": True, "solicitud": serializar_solicitud(solicitud)})
