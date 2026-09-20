import json

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.views.decorators.http import require_GET, require_POST

from apps.clientes.models import Cliente
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Notificacion, Usuario
from apps.usuarios.auditoria import registrar_auditoria
from apps.usuarios.api import obtener_datos_request as obtener_datos_request_comun
from .history import (
    registrar_asignacion,
    registrar_cambio_estado,
    registrar_cancelacion,
    registrar_creacion,
    registrar_diagnostico,
    registrar_finalizacion,
    registrar_inicio,
)
from .models import HistorialSolicitud, SolicitudServicio


ESTADOS_FRONT = {
    "Pendiente": SolicitudServicio.Estado.PENDIENTE,
    "En Proceso": SolicitudServicio.Estado.EN_PROCESO,
    "En proceso": SolicitudServicio.Estado.EN_PROCESO,
    "Completado": SolicitudServicio.Estado.COMPLETADO,
    "Cancelado": SolicitudServicio.Estado.CANCELADO,
}

TRANSICIONES_ESTADO = {
    SolicitudServicio.Estado.PENDIENTE: {
        SolicitudServicio.Estado.EN_PROCESO,
        SolicitudServicio.Estado.CANCELADO,
    },
    SolicitudServicio.Estado.EN_PROCESO: {
        SolicitudServicio.Estado.COMPLETADO,
        SolicitudServicio.Estado.CANCELADO,
    },
    SolicitudServicio.Estado.COMPLETADO: set(),
    SolicitudServicio.Estado.CANCELADO: set(),
}

ESTADOS_TERMINALES = {
    SolicitudServicio.Estado.COMPLETADO,
    SolicitudServicio.Estado.CANCELADO,
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
    if not isinstance(valor, str):
        raise ValueError("El estado indicado no es válido.")

    estado = valor.strip()
    if estado in ESTADOS_FRONT:
        return ESTADOS_FRONT[estado]
    if estado in SolicitudServicio.Estado.values:
        return estado
    raise ValueError("El estado indicado no es válido.")


def version_db(valor):
    if not isinstance(valor, str) or not valor.strip():
        raise ValueError("Falta la versión actual de la orden.")

    version = parse_datetime(valor.strip())
    if version is None or timezone.is_naive(version):
        raise ValueError("La versión de la orden no es válida.")
    return version


def transicion_permitida(estado_anterior, estado_nuevo):
    return (
        estado_anterior == estado_nuevo
        or estado_nuevo in TRANSICIONES_ESTADO.get(estado_anterior, set())
    )


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
    reingreso = getattr(solicitud, "reingreso_garantia", None)
    orden_original_garantia = None
    if reingreso:
        original = reingreso.garantia.solicitud_original
        orden_original_garantia = {
            "id": original.id,
            "codigo": f"SOL-{original.id:03d}",
        }

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
        "esReingresoGarantia": reingreso is not None,
        "ordenOriginalGarantia": orden_original_garantia,
    }


def serializar_actor_historial(evento, incluir_datos_internos):
    actor = {
        "nombre": evento.usuario_nombre or "Sistema",
        "rol": evento.usuario_rol or "sistema",
    }
    if incluir_datos_internos:
        actor.update({
            "id": evento.usuario_id,
            "username": evento.usuario_username,
        })
    return actor


def serializar_tecnico_historial(evento, prefijo, incluir_datos_internos):
    tecnico_id = getattr(evento, f"{prefijo}_id")
    username = getattr(evento, f"{prefijo}_username")
    nombre = getattr(evento, f"{prefijo}_nombre")
    if not tecnico_id and not username and not nombre:
        return None

    tecnico = {"nombre": nombre or username}
    if incluir_datos_internos:
        tecnico.update({"id": tecnico_id, "username": username})
    return tecnico


def serializar_evento_historial(evento, incluir_datos_internos):
    estados = dict(SolicitudServicio.Estado.choices)
    return {
        "id": evento.id,
        "accion": evento.accion,
        "accionNombre": evento.get_accion_display(),
        "descripcion": evento.descripcion,
        "visibilidad": evento.visibilidad,
        "estadoAnterior": evento.estado_anterior,
        "estadoAnteriorNombre": estados.get(evento.estado_anterior, ""),
        "estadoNuevo": evento.estado_nuevo,
        "estadoNuevoNombre": estados.get(evento.estado_nuevo, ""),
        "tecnicoAnterior": serializar_tecnico_historial(
            evento,
            "tecnico_anterior",
            incluir_datos_internos,
        ),
        "tecnicoNuevo": serializar_tecnico_historial(
            evento,
            "tecnico_nuevo",
            incluir_datos_internos,
        ),
        "usuario": serializar_actor_historial(evento, incluir_datos_internos),
        "fecha": evento.creado_en.isoformat(),
    }


def queryset_por_rol(usuario):
    solicitudes = SolicitudServicio.objects.select_related(
        "cliente__usuario",
        "tecnico__usuario",
        "factura",
        "reingreso_garantia__garantia__solicitud_original",
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
    try:
        estado = estado_db(datos.get("estado", "Pendiente"))
    except ValueError as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=400)
    if estado != SolicitudServicio.Estado.PENDIENTE:
        return JsonResponse(
            {"ok": False, "error": "Toda orden nueva debe iniciar en estado Pendiente."},
            status=400,
        )

    tecnico_recibido = datos.get("tecnico", "").strip()
    tecnico = buscar_tecnico(tecnico_recibido)
    if tecnico_recibido and not tecnico:
        return JsonResponse(
            {"ok": False, "error": "El técnico indicado no está disponible."},
            status=400,
        )
    cliente_nombre = ""

    if request.user.rol == Usuario.Rol.CLIENTE and hasattr(request.user, "perfil_cliente"):
        cliente = request.user.perfil_cliente
        cliente_nombre = request.user.get_full_name() or request.user.username
        tecnico = None
    elif request.user.rol == Usuario.Rol.ADMIN:
        cliente_nombre = datos.get("cliente", "").strip()
        cliente = buscar_cliente_por_id(datos.get("clienteId")) or buscar_cliente(cliente_nombre)
    else:
        return JsonResponse({"ok": False, "error": "No tienes permiso para crear solicitudes."}, status=403)

    if not all([cliente_nombre, dispositivo, problema, fecha]):
        return JsonResponse({"ok": False, "error": "Completa cliente, dispositivo, servicio y fecha."}, status=400)

    with transaction.atomic():
        solicitud = SolicitudServicio.objects.create(
            cliente=cliente,
            cliente_nombre="" if cliente else cliente_nombre,
            tecnico=tecnico,
            dispositivo=dispositivo,
            problema=problema,
            fecha_preferida=fecha,
            prioridad=prioridad,
            estado=SolicitudServicio.Estado.PENDIENTE,
        )
        registrar_creacion(solicitud, request.user)
        if solicitud.tecnico:
            registrar_asignacion(solicitud, request.user, None, solicitud.tecnico)
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

    datos, error = obtener_datos_request_comun(request)
    if error:
        return error

    try:
        version_recibida = version_db(datos.get("actualizadoEn"))
    except ValueError as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=400)

    with transaction.atomic():
        try:
            solicitud = (
                SolicitudServicio.objects.select_for_update(of=("self",))
                .select_related(
                    "cliente__usuario",
                    "tecnico__usuario",
                    "factura",
                    "garantia",
                    "reingreso_garantia__garantia__solicitud_original",
                )
                .get(id=solicitud_id)
            )
        except SolicitudServicio.DoesNotExist:
            return JsonResponse(
                {"ok": False, "error": "Solicitud no encontrada."},
                status=404,
            )

        es_admin = request.user.rol == Usuario.Rol.ADMIN
        perfil_tecnico = getattr(request.user, "perfil_tecnico", None)
        es_tecnico_asignado = (
            request.user.rol == Usuario.Rol.TECNICO
            and perfil_tecnico is not None
            and solicitud.tecnico_id == perfil_tecnico.id
        )
        if not es_admin and not es_tecnico_asignado:
            return JsonResponse(
                {"ok": False, "error": "No tienes permiso para actualizar esta solicitud."},
                status=403,
            )

        if version_recibida != solicitud.actualizado_en:
            return JsonResponse(
                {
                    "ok": False,
                    "error": "La orden cambió mientras la editabas. Recarga los datos e intenta nuevamente.",
                    "solicitud": serializar_solicitud(solicitud),
                },
                status=409,
            )

        if hasattr(solicitud, "factura"):
            return JsonResponse(
                {"ok": False, "error": "Una orden facturada no puede modificarse."},
                status=409,
            )
        if hasattr(solicitud, "garantia"):
            return JsonResponse(
                {"ok": False, "error": "La orden original de una garantía no puede modificarse."},
                status=409,
            )
        if solicitud.estado in ESTADOS_TERMINALES:
            return JsonResponse(
                {"ok": False, "error": "Una orden completada o cancelada ya no puede modificarse."},
                status=409,
            )

        estado_anterior = solicitud.estado
        tecnico_anterior = solicitud.tecnico
        tecnico_anterior_id = solicitud.tecnico_id
        diagnostico_anterior = solicitud.diagnostico
        repuesto_anterior = solicitud.repuesto_usado

        try:
            estado_nuevo = estado_db(datos.get("estado", solicitud.estado))
        except ValueError as exc:
            return JsonResponse({"ok": False, "error": str(exc)}, status=400)

        if es_admin:
            cliente_nombre = datos.get(
                "cliente",
                nombre_cliente_visible(solicitud),
            )
            dispositivo = datos.get("dispositivo", solicitud.dispositivo)
            problema = datos.get("servicio", solicitud.problema)
            tecnico_recibido = datos.get(
                "tecnico",
                solicitud.tecnico.usuario.username if solicitud.tecnico else "",
            )
            if not all(
                isinstance(valor, str)
                for valor in [cliente_nombre, dispositivo, problema, tecnico_recibido]
            ):
                return JsonResponse(
                    {"ok": False, "error": "Los datos principales de la orden no son válidos."},
                    status=400,
                )

            cliente_nombre = cliente_nombre.strip()
            dispositivo = dispositivo.strip()
            problema = problema.strip()
            tecnico_recibido = tecnico_recibido.strip()
            fecha = fecha_db(datos.get("fecha", solicitud.fecha_preferida))
            cliente = buscar_cliente_por_id(datos.get("clienteId")) or buscar_cliente(cliente_nombre)
            tecnico = buscar_tecnico(tecnico_recibido)
            if tecnico_recibido and not tecnico:
                return JsonResponse(
                    {"ok": False, "error": "El técnico indicado no está disponible."},
                    status=400,
                )
            if not all([cliente_nombre, dispositivo, problema, fecha]):
                return JsonResponse(
                    {"ok": False, "error": "Completa cliente, dispositivo, servicio y fecha."},
                    status=400,
                )

            cliente_nombre_bd = "" if cliente else cliente_nombre
            if estado_anterior == SolicitudServicio.Estado.EN_PROCESO:
                identidad_modificada = any([
                    solicitud.cliente_id != (cliente.id if cliente else None),
                    solicitud.cliente_nombre != cliente_nombre_bd,
                    solicitud.dispositivo != dispositivo,
                    solicitud.problema != problema,
                    solicitud.fecha_preferida != fecha,
                ])
                if identidad_modificada:
                    return JsonResponse(
                        {
                            "ok": False,
                            "error": "Cliente, dispositivo, servicio y fecha no pueden cambiar mientras el trabajo está en proceso.",
                        },
                        status=409,
                    )
                if not tecnico:
                    return JsonResponse(
                        {"ok": False, "error": "Un trabajo en proceso debe conservar un técnico asignado."},
                        status=400,
                    )
            else:
                solicitud.cliente = cliente
                solicitud.cliente_nombre = cliente_nombre_bd
                solicitud.dispositivo = dispositivo
                solicitud.problema = problema
                solicitud.fecha_preferida = fecha

            solicitud.tecnico = tecnico
            solicitud.prioridad = prioridad_db(
                datos.get("prioridad", solicitud.get_prioridad_display())
            )
        else:
            if estado_nuevo == SolicitudServicio.Estado.CANCELADO:
                return JsonResponse(
                    {"ok": False, "error": "Solo el administrador puede cancelar una orden."},
                    status=403,
                )
            if estado_anterior == SolicitudServicio.Estado.PENDIENTE and estado_nuevo == estado_anterior:
                return JsonResponse(
                    {"ok": False, "error": "Inicia el trabajo antes de registrar cambios."},
                    status=400,
                )

            diagnostico = datos.get("diagnostico", "")
            repuesto = datos.get("repuesto", "")
            if not isinstance(diagnostico, str) or not isinstance(repuesto, str):
                return JsonResponse(
                    {"ok": False, "error": "El diagnóstico y el repuesto deben enviarse como texto."},
                    status=400,
                )
            solicitud.diagnostico = diagnostico.strip()
            solicitud.repuesto_usado = repuesto.strip()

        if not transicion_permitida(estado_anterior, estado_nuevo):
            return JsonResponse(
                {
                    "ok": False,
                    "error": (
                        f"No se permite cambiar una orden de "
                        f"{solicitud.get_estado_display()} a "
                        f"{dict(SolicitudServicio.Estado.choices).get(estado_nuevo, estado_nuevo)}."
                    ),
                },
                status=409,
            )
        if estado_nuevo == SolicitudServicio.Estado.CANCELADO and not es_admin:
            return JsonResponse(
                {"ok": False, "error": "Solo el administrador puede cancelar una orden."},
                status=403,
            )
        if estado_nuevo in {
            SolicitudServicio.Estado.EN_PROCESO,
            SolicitudServicio.Estado.COMPLETADO,
        } and not solicitud.tecnico:
            return JsonResponse(
                {"ok": False, "error": "Asigna un técnico antes de iniciar o completar la orden."},
                status=400,
            )
        if (
            estado_nuevo == SolicitudServicio.Estado.COMPLETADO
            and len(solicitud.diagnostico.strip()) < 10
        ):
            return JsonResponse(
                {"ok": False, "error": "Para completar el trabajo, agrega un diagnóstico claro."},
                status=400,
            )

        solicitud.estado = estado_nuevo
        solicitud.save()

        if tecnico_anterior_id != solicitud.tecnico_id:
            registrar_asignacion(
                solicitud,
                request.user,
                tecnico_anterior,
                solicitud.tecnico,
            )
        if estado_anterior != solicitud.estado and solicitud.estado == SolicitudServicio.Estado.EN_PROCESO:
            registrar_inicio(solicitud, request.user, estado_anterior)
        if (
            diagnostico_anterior != solicitud.diagnostico
            or repuesto_anterior != solicitud.repuesto_usado
        ):
            registrar_diagnostico(solicitud, request.user)
        if estado_anterior != solicitud.estado and solicitud.estado != SolicitudServicio.Estado.EN_PROCESO:
            if solicitud.estado == SolicitudServicio.Estado.COMPLETADO:
                registrar_finalizacion(solicitud, request.user, estado_anterior)
            elif solicitud.estado == SolicitudServicio.Estado.CANCELADO:
                registrar_cancelacion(solicitud, request.user, estado_anterior)
            else:
                registrar_cambio_estado(solicitud, request.user, estado_anterior)

        registrar_auditoria(
            request,
            "actualizar",
            "servicios",
            f"Orden SOL-{solicitud.id:03d} actualizada a {solicitud.get_estado_display()}.",
            solicitud.id,
        )
        if es_admin and solicitud.tecnico_id and solicitud.tecnico_id != tecnico_anterior_id:
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

    with transaction.atomic():
        try:
            solicitud = (
                SolicitudServicio.objects.select_for_update(of=("self",))
                .select_related("factura", "garantia", "reingreso_garantia")
                .get(id=solicitud_id)
            )
        except SolicitudServicio.DoesNotExist:
            return JsonResponse(
                {"ok": False, "error": "Solicitud no encontrada."},
                status=404,
            )

        if hasattr(solicitud, "factura"):
            return JsonResponse(
                {
                    "ok": False,
                    "error": "No se puede eliminar una orden facturada. Conserva ese registro para el historial.",
                },
                status=400,
            )

        if hasattr(solicitud, "garantia") or hasattr(solicitud, "reingreso_garantia"):
            return JsonResponse(
                {
                    "ok": False,
                    "error": "No se puede eliminar una orden relacionada con una garantía.",
                },
                status=400,
            )

        registrar_auditoria(
            request,
            "eliminar",
            "servicios",
            f"Orden SOL-{solicitud.id:03d} eliminada.",
            solicitud.id,
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

    incluir_datos_internos = request.user.rol in [Usuario.Rol.ADMIN, Usuario.Rol.TECNICO]
    eventos = solicitud.historial.select_related(
        "usuario",
        "tecnico_anterior__usuario",
        "tecnico_nuevo__usuario",
    )
    if request.user.rol == Usuario.Rol.CLIENTE:
        eventos = eventos.filter(visibilidad=HistorialSolicitud.Visibilidad.PUBLICO)

    return JsonResponse({
        "ok": True,
        "solicitud": {
            "id": solicitud.id,
            "codigo": f"SOL-{solicitud.id:03d}",
        },
        "historial": [
            serializar_evento_historial(evento, incluir_datos_internos)
            for evento in eventos
        ],
    })
