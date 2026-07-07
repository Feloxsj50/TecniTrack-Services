import json
import re

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from .models import Cliente


def es_admin(usuario):
    return usuario.is_authenticated and usuario.rol == "admin"


def validar_admin(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sesion Django no activa. Cierra sesion e inicia como admin nuevamente."}, status=401)

    if request.user.rol != "admin":
        return JsonResponse({"ok": False, "error": "Solo admin puede modificar clientes."}, status=403)

    return None


def serializar_cliente(cliente):
    usuario = cliente.usuario
    return {
        "id": cliente.id,
        "usuario": usuario.username,
        "nombre": usuario.get_full_name() or usuario.username,
        "correo": usuario.email,
        "telefono": usuario.telefono,
        "estado": "Activo" if usuario.activo else "Inactivo",
        "creado_en": cliente.creado_en.isoformat(),
    }


def obtener_datos_request(request):
    if request.content_type == "application/json":
        try:
            return json.loads(request.body.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, JsonResponse({"ok": False, "error": "Datos invalidos."}, status=400)

    return request.POST, None


def separar_nombre(nombre):
    partes = nombre.strip().split()
    if not partes:
        return "", ""
    if len(partes) == 1:
        return partes[0], ""
    return partes[0], " ".join(partes[1:])


@require_GET
def listar_clientes(request):
    clientes = Cliente.objects.select_related("usuario").all()
    data = [serializar_cliente(cliente) for cliente in clientes]

    return JsonResponse({
        "ok": True,
        "clientes": data,
        "total": len(data),
    })


@require_POST
def actualizar_cliente(request, cliente_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    datos, error = obtener_datos_request(request)
    if error:
        return error

    try:
        cliente = Cliente.objects.select_related("usuario").get(id=cliente_id)
    except Cliente.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Cliente no encontrado."}, status=404)

    nombre = datos.get("nombre", "").strip()
    correo = datos.get("correo", "").strip().lower()
    telefono = datos.get("telefono", "").strip()
    estado = datos.get("estado", "Activo").strip()

    if not all([nombre, correo, telefono, estado]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos."}, status=400)

    if len(nombre) < 3:
        return JsonResponse({"ok": False, "error": "El nombre debe tener al menos 3 caracteres."}, status=400)

    if "@" not in correo or "." not in correo:
        return JsonResponse({"ok": False, "error": "Ingresa un correo valido."}, status=400)

    if not re.fullmatch(r"\d{4}-\d{4}", telefono):
        return JsonResponse({"ok": False, "error": "El telefono debe tener el formato 7777-8888."}, status=400)

    if estado not in ["Activo", "Inactivo"]:
        return JsonResponse({"ok": False, "error": "Estado invalido."}, status=400)

    usuario = cliente.usuario
    if usuario.__class__.objects.filter(email=correo).exclude(id=usuario.id).exists():
        return JsonResponse({"ok": False, "error": "Este correo ya esta en uso."}, status=409)

    usuario.first_name, usuario.last_name = separar_nombre(nombre)
    usuario.email = correo
    usuario.telefono = telefono
    usuario.activo = estado == "Activo"
    usuario.save()

    return JsonResponse({"ok": True, "cliente": serializar_cliente(cliente)})


@require_POST
def eliminar_cliente(request, cliente_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    try:
        cliente = Cliente.objects.select_related("usuario").get(id=cliente_id)
    except Cliente.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Cliente no encontrado."}, status=404)

    cliente.usuario.delete()
    return JsonResponse({"ok": True})
