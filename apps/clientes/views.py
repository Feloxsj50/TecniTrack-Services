import json
import re

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from apps.servicios.models import SolicitudServicio
from apps.usuarios.models import Usuario
from apps.usuarios.auditoria import registrar_auditoria
from .models import Cliente


TELEFONO_RE = r"\d{4}-\d{4}"
USERNAME_RE = r"[A-Za-z0-9._-]{4,30}"


def validar_admin(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sesión Django no activa. Cierra sesión e inicia como admin nuevamente."}, status=401)

    if request.user.rol != Usuario.Rol.ADMIN:
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
    if request.content_type and request.content_type.startswith("application/json"):
        try:
            return json.loads(request.body.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, JsonResponse({"ok": False, "error": "Datos inválidos."}, status=400)

    return request.POST, None


def separar_nombre(nombre):
    partes = nombre.strip().split()
    if not partes:
        return "", ""
    if len(partes) == 1:
        return partes[0], ""
    return partes[0], " ".join(partes[1:])


def validar_campos_cliente(datos, requiere_usuario=False, requiere_password=False, usuario_actual=None):
    nombre = datos.get("nombre", "").strip()
    username = datos.get("username", "").strip()
    correo = datos.get("correo", "").strip().lower()
    telefono = datos.get("telefono", "").strip()
    password = datos.get("password", "")
    estado = datos.get("estado", "Activo").strip()

    if not all([nombre, correo, telefono, estado]):
        return None, JsonResponse({"ok": False, "error": "Completa nombre, correo, teléfono y estado."}, status=400)

    if requiere_usuario and not username:
        return None, JsonResponse({"ok": False, "error": "Ingresa un nombre de usuario para el cliente."}, status=400)

    if requiere_password and not password:
        return None, JsonResponse({"ok": False, "error": "Ingresa una contraseña temporal para el cliente."}, status=400)

    if len(nombre) < 3:
        return None, JsonResponse({"ok": False, "error": "El nombre debe tener al menos 3 caracteres."}, status=400)

    if username and not re.fullmatch(USERNAME_RE, username):
        return None, JsonResponse({"ok": False, "error": "El usuario debe tener 4 a 30 caracteres válidos."}, status=400)

    if "@" not in correo or "." not in correo:
        return None, JsonResponse({"ok": False, "error": "Ingresa un correo válido."}, status=400)

    if not re.fullmatch(TELEFONO_RE, telefono):
        return None, JsonResponse({"ok": False, "error": "El teléfono debe tener el formato 7777-8888."}, status=400)

    if password and len(password) < 8:
        return None, JsonResponse({"ok": False, "error": "La contraseña temporal debe tener al menos 8 caracteres."}, status=400)

    if estado not in ["Activo", "Inactivo"]:
        return None, JsonResponse({"ok": False, "error": "Estado inválido."}, status=400)

    correo_query = Usuario.objects.filter(email=correo)
    if usuario_actual:
        correo_query = correo_query.exclude(id=usuario_actual.id)
    if correo_query.exists():
        return None, JsonResponse({"ok": False, "error": "Este correo ya esta en uso."}, status=409)

    if username:
        username_query = Usuario.objects.filter(username__iexact=username)
        if usuario_actual:
            username_query = username_query.exclude(id=usuario_actual.id)
        if username_query.exists():
            return None, JsonResponse({"ok": False, "error": "Este nombre de usuario ya esta en uso."}, status=409)

    return {
        "nombre": nombre,
        "username": username,
        "correo": correo,
        "telefono": telefono,
        "password": password,
        "estado": estado,
    }, None


@require_GET
def listar_clientes(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    clientes = Cliente.objects.select_related("usuario").all().order_by("-creado_en")
    data = [serializar_cliente(cliente) for cliente in clientes]

    return JsonResponse({
        "ok": True,
        "clientes": data,
        "total": len(data),
    })


@require_POST
def crear_cliente(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    datos, error = obtener_datos_request(request)
    if error:
        return error

    limpio, error = validar_campos_cliente(datos, requiere_usuario=True, requiere_password=True)
    if error:
        return error

    first_name, last_name = separar_nombre(limpio["nombre"])
    usuario = Usuario.objects.create_user(
        username=limpio["username"],
        email=limpio["correo"],
        password=limpio["password"],
        first_name=first_name,
        last_name=last_name,
        telefono=limpio["telefono"],
        rol=Usuario.Rol.CLIENTE,
        activo=limpio["estado"] == "Activo",
    )
    cliente = Cliente.objects.create(usuario=usuario)
    registrar_auditoria(request, "crear", "clientes", f"Cliente creado: {usuario.username}.", cliente.id)

    return JsonResponse({"ok": True, "cliente": serializar_cliente(cliente)}, status=201)


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

    limpio, error = validar_campos_cliente(datos, usuario_actual=cliente.usuario)
    if error:
        return error

    usuario = cliente.usuario
    usuario.first_name, usuario.last_name = separar_nombre(limpio["nombre"])
    usuario.email = limpio["correo"]
    usuario.telefono = limpio["telefono"]
    usuario.activo = limpio["estado"] == "Activo"

    if limpio["password"]:
        usuario.set_password(limpio["password"])

    usuario.save()
    registrar_auditoria(request, "actualizar", "clientes", f"Cliente actualizado: {usuario.username}.", cliente.id)

    return JsonResponse({"ok": True, "cliente": serializar_cliente(cliente)})


@require_POST
def eliminar_cliente(request, cliente_id):
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

    eliminar_solicitudes = bool(datos.get("eliminarSolicitudes"))
    nombre_cliente = cliente.usuario.get_full_name() or cliente.usuario.username
    registrar_auditoria(request, "eliminar", "clientes", f"Cliente eliminado: {nombre_cliente}.", cliente.id)
    if eliminar_solicitudes:
        SolicitudServicio.objects.filter(cliente=cliente, factura__isnull=True).delete()

    SolicitudServicio.objects.filter(cliente=cliente).update(
        cliente_nombre=nombre_cliente,
        cliente=None,
    )

    cliente.usuario.delete()
    return JsonResponse({"ok": True})
