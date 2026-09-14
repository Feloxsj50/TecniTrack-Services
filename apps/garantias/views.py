from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from apps.servicios.models import SolicitudServicio
from apps.usuarios.api import obtener_datos_request, validar_admin
from apps.usuarios.auditoria import registrar_auditoria
from apps.usuarios.models import Usuario

from .models import Garantia, ReingresoGarantia
from .serializers import serializar_garantia
from .services import ErrorGarantia, anular_garantia, crear_garantia, crear_reingreso


def _garantia_de_solicitud(solicitud):
    try:
        return solicitud.garantia
    except Garantia.DoesNotExist:
        pass
    try:
        return solicitud.reingreso_garantia.garantia
    except ReingresoGarantia.DoesNotExist:
        return None


def _puede_ver(usuario, solicitud, garantia):
    if usuario.rol == Usuario.Rol.ADMIN:
        return True

    original = garantia.solicitud_original if garantia else solicitud
    reingreso = None
    if garantia:
        try:
            reingreso = garantia.reingreso.solicitud_reingreso
        except ReingresoGarantia.DoesNotExist:
            pass

    if usuario.rol == Usuario.Rol.CLIENTE and hasattr(usuario, "perfil_cliente"):
        cliente_id = usuario.perfil_cliente.id
        return original.cliente_id == cliente_id or (
            reingreso is not None and reingreso.cliente_id == cliente_id
        )

    if usuario.rol == Usuario.Rol.TECNICO and hasattr(usuario, "perfil_tecnico"):
        tecnico_id = usuario.perfil_tecnico.id
        return original.tecnico_id == tecnico_id or (
            reingreso is not None and reingreso.tecnico_id == tecnico_id
        )
    return False


def _datos_json(request):
    datos, error = obtener_datos_request(request)
    if error:
        return None, error
    if not hasattr(datos, "get"):
        return None, JsonResponse(
            {"ok": False, "error": "Los datos enviados no tienen un formato válido."},
            status=400,
        )
    return datos, None


def _error_validacion(exc):
    if hasattr(exc, "message_dict"):
        mensajes = [mensaje for lista in exc.message_dict.values() for mensaje in lista]
        return " ".join(mensajes)
    return " ".join(exc.messages)


def _id_positivo(valor):
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        return valor if valor > 0 else None
    if isinstance(valor, str) and valor.strip().isdecimal():
        numero = int(valor)
        return numero if numero > 0 else None
    return None


@require_GET
def detalle_garantia(request, solicitud_id):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    solicitud = SolicitudServicio.objects.select_related(
        "cliente__usuario",
        "tecnico__usuario",
    ).filter(pk=solicitud_id).first()
    if not solicitud:
        return JsonResponse({"ok": False, "error": "Solicitud no encontrada."}, status=404)

    garantia = _garantia_de_solicitud(solicitud)
    if not _puede_ver(request.user, solicitud, garantia):
        return JsonResponse(
            {"ok": False, "error": "No tienes permiso para consultar esta garantía."},
            status=403,
        )

    incluir_internos = request.user.rol in [Usuario.Rol.ADMIN, Usuario.Rol.TECNICO]
    return JsonResponse({
        "ok": True,
        "garantia": serializar_garantia(garantia, incluir_internos) if garantia else None,
    })


@require_POST
def crear(request):
    permiso = validar_admin(request, "Solo el administrador puede crear garantías.")
    if permiso:
        return permiso
    datos, error = _datos_json(request)
    if error:
        return error

    solicitud_id = _id_positivo(datos.get("solicitudId") or datos.get("solicitud_id"))
    if solicitud_id is None:
        return JsonResponse(
            {"ok": False, "error": "Selecciona una orden completada válida."},
            status=400,
        )

    try:
        garantia = crear_garantia(
            solicitud_id,
            datos.get("duracionDias", datos.get("duracion_dias")),
            request.user,
            datos.get("condicionesPublicas", datos.get("condiciones_publicas", "")),
            datos.get("notasInternas", datos.get("notas_internas", "")),
        )
    except SolicitudServicio.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Solicitud no encontrada."}, status=404)
    except (ErrorGarantia, ValidationError) as exc:
        mensaje = _error_validacion(exc) if isinstance(exc, ValidationError) else str(exc)
        return JsonResponse({"ok": False, "error": mensaje}, status=400)

    registrar_auditoria(
        request,
        "crear",
        "garantias",
        f"Garantía creada para SOL-{solicitud_id:03d}.",
        garantia.id,
    )
    return JsonResponse(
        {"ok": True, "garantia": serializar_garantia(garantia, True)},
        status=201,
    )


@require_POST
def registrar_reingreso(request, garantia_id):
    permiso = validar_admin(request, "Solo el administrador puede registrar reingresos.")
    if permiso:
        return permiso
    datos, error = _datos_json(request)
    if error:
        return error

    try:
        reingreso = crear_reingreso(
            garantia_id,
            request.user,
            datos.get("motivo", ""),
            datos.get("observacionesInternas", datos.get("observaciones_internas", "")),
        )
    except Garantia.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Garantía no encontrada."}, status=404)
    except (ErrorGarantia, ValidationError) as exc:
        mensaje = _error_validacion(exc) if isinstance(exc, ValidationError) else str(exc)
        return JsonResponse({"ok": False, "error": mensaje}, status=400)

    registrar_auditoria(
        request,
        "crear_reingreso",
        "garantias",
        f"Reingreso SOL-{reingreso.solicitud_reingreso_id:03d} registrado.",
        reingreso.id,
    )
    return JsonResponse(
        {"ok": True, "garantia": serializar_garantia(reingreso.garantia, True)},
        status=201,
    )


@require_POST
def anular(request, garantia_id):
    permiso = validar_admin(request, "Solo el administrador puede anular garantías.")
    if permiso:
        return permiso
    datos, error = _datos_json(request)
    if error:
        return error

    try:
        garantia = anular_garantia(garantia_id, request.user, datos.get("motivo", ""))
    except Garantia.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Garantía no encontrada."}, status=404)
    except (ErrorGarantia, ValidationError) as exc:
        mensaje = _error_validacion(exc) if isinstance(exc, ValidationError) else str(exc)
        return JsonResponse({"ok": False, "error": mensaje}, status=400)

    registrar_auditoria(
        request,
        "anular",
        "garantias",
        f"Garantía {garantia.id} anulada.",
        garantia.id,
    )
    return JsonResponse({"ok": True, "garantia": serializar_garantia(garantia, True)})
