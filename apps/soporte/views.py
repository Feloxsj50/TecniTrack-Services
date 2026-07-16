import json

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from apps.usuarios.models import Usuario
from apps.usuarios.auditoria import registrar_auditoria
from apps.usuarios.api import obtener_datos_request as obtener_datos_request_comun, validar_admin as validar_admin_comun
from .models import TicketSoporte


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
        return JsonResponse({"ok": False, "error": "Solo admin puede responder tickets."}, status=403)
    return None


def tickets_por_rol(usuario):
    tickets = TicketSoporte.objects.select_related("usuario")
    if usuario.rol == Usuario.Rol.ADMIN:
        return tickets
    return tickets.filter(usuario=usuario)


def serializar_ticket(ticket):
    return {
        "id": f"TK-{ticket.id:03d}",
        "dbId": ticket.id,
        "fecha": ticket.creado_en.date().isoformat(),
        "rol": ticket.rol,
        "usuario": ticket.usuario.username,
        "nombre": ticket.nombre,
        "correo": ticket.correo,
        "asunto": ticket.asunto,
        "area": ticket.area,
        "detalle": ticket.detalle,
        "respuesta": ticket.respuesta,
        "estado": ticket.get_estado_display(),
        "creadoEn": ticket.creado_en.isoformat(),
        "respondidoEn": ticket.respondido_en.isoformat() if ticket.respondido_en else "",
    }


@require_GET
def listar_tickets(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)

    data = [serializar_ticket(ticket) for ticket in tickets_por_rol(request.user)]
    return JsonResponse({"ok": True, "tickets": data, "total": len(data)})


@require_POST
def crear_ticket(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesión activa."}, status=401)
    if request.user.rol == Usuario.Rol.ADMIN:
        return JsonResponse({"ok": False, "error": "Admin responde tickets desde la tabla."}, status=403)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    nombre = str(datos.get("nombre", "")).strip()
    correo = str(datos.get("correo", "")).strip().lower()
    asunto = str(datos.get("asunto", "")).strip()
    area = str(datos.get("area", "")).strip()
    detalle = str(datos.get("detalle", "")).strip()

    if not all([nombre, correo, asunto, area, detalle]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos de soporte."}, status=400)
    if "@" not in correo or "." not in correo:
        return JsonResponse({"ok": False, "error": "Ingresa un correo válido."}, status=400)
    if len(asunto) < 4 or len(detalle) < 8:
        return JsonResponse({"ok": False, "error": "Describe mejor tu consulta de soporte."}, status=400)

    ticket = TicketSoporte.objects.create(
        usuario=request.user,
        rol=request.user.rol,
        nombre=nombre,
        correo=correo,
        asunto=asunto,
        area=area,
        detalle=detalle,
    )
    registrar_auditoria(request, "crear", "soporte", f"Ticket TK-{ticket.id:03d} creado.", ticket.id)
    return JsonResponse({"ok": True, "ticket": serializar_ticket(ticket)}, status=201)


@require_POST
def responder_ticket(request, ticket_id):
    permiso = validar_admin_comun(request, "Solo el administrador puede responder tickets.")
    if permiso:
        return permiso

    try:
        ticket = TicketSoporte.objects.select_related("usuario").get(id=ticket_id)
    except TicketSoporte.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Ticket no encontrado."}, status=404)

    datos, error = obtener_datos_request_comun(request)
    if error:
        return error

    respuesta = str(datos.get("respuesta", "")).strip()
    if len(respuesta) < 4:
        return JsonResponse({"ok": False, "error": "Escribe una respuesta clara."}, status=400)

    ticket.respuesta = respuesta
    ticket.estado = TicketSoporte.Estado.RESPONDIDO
    ticket.respondido_en = timezone.now()
    ticket.save()
    registrar_auditoria(request, "responder", "soporte", f"Ticket TK-{ticket.id:03d} respondido.", ticket.id)
    return JsonResponse({"ok": True, "ticket": serializar_ticket(ticket)})
