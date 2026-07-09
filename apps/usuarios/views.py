import json
import re

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth import update_session_auth_hash
from django.middleware.csrf import get_token
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from apps.clientes.models import Cliente
from apps.usuarios.models import ConfiguracionTaller, Usuario


def serializar_usuario(usuario):
    area = "Administracion" if usuario.rol == Usuario.Rol.ADMIN else "Cliente"
    if usuario.rol == Usuario.Rol.TECNICO and hasattr(usuario, "perfil_tecnico"):
        area = usuario.perfil_tecnico.especialidad or "Tecnico"

    return {
        "id": usuario.id,
        "username": usuario.username,
        "nombre": usuario.get_full_name() or usuario.username,
        "email": usuario.email,
        "telefono": usuario.telefono,
        "rol": usuario.rol,
        "area": area,
        "activo": usuario.activo,
    }



def validar_admin(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesion activa."}, status=401)
    if request.user.rol != Usuario.Rol.ADMIN:
        return JsonResponse({"ok": False, "error": "Solo admin puede realizar esta accion."}, status=403)
    return None


def separar_nombre(nombre):
    partes = nombre.strip().split()
    if not partes:
        return "", ""
    if len(partes) == 1:
        return partes[0], ""
    return partes[0], " ".join(partes[1:])


def taller_actual():
    taller, _ = ConfiguracionTaller.objects.get_or_create(id=1)
    return taller


def serializar_taller(taller):
    return {
        "nombre": taller.nombre,
        "correo": taller.correo,
        "direccion": taller.direccion,
        "telefono": taller.telefono,
        "whatsapp": taller.whatsapp,
        "horario": taller.horario,
        "actualizadoEn": taller.actualizado_en.isoformat(),
    }
@ensure_csrf_cookie
@require_GET
def csrf_token(request):
    return JsonResponse({"ok": True, "csrfToken": get_token(request)})


def obtener_datos_request(request):
    if request.content_type == "application/json":
        try:
            return json.loads(request.body.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, JsonResponse({"ok": False, "error": "Datos invalidos."}, status=400)

    return request.POST, None


@require_POST
def iniciar_sesion(request):
    datos, error = obtener_datos_request(request)
    if error:
        return error

    username = datos.get("usuario", "").strip()
    password = datos.get("password", "")

    if not username or not password:
        return JsonResponse({"ok": False, "error": "Completa usuario y contrasena."}, status=400)

    usuario = authenticate(request, username=username, password=password)

    if not usuario or not usuario.activo:
        return JsonResponse({"ok": False, "error": "Usuario o contrasena incorrectos."}, status=401)

    login(request, usuario)
    return JsonResponse({"ok": True, "usuario": serializar_usuario(usuario)})


@require_POST
def registrar_cliente(request):
    datos, error = obtener_datos_request(request)
    if error:
        return error

    nombres = datos.get("nombres", "").strip()
    apellidos = datos.get("apellidos", "").strip()
    username = datos.get("username", "").strip()
    email = datos.get("email", "").strip().lower()
    telefono = datos.get("telefono", "").strip()
    password = datos.get("password", "")
    confirmacion = datos.get("confirmPassword", "")

    if not all([nombres, apellidos, username, email, telefono, password, confirmacion]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos."}, status=400)

    if len(nombres) < 2 or len(apellidos) < 2:
        return JsonResponse({"ok": False, "error": "Nombre y apellido deben tener al menos 2 letras."}, status=400)

    if not re.fullmatch(r"[A-Za-z0-9._-]{4,30}", username):
        return JsonResponse(
            {"ok": False, "error": "El nombre de usuario debe tener 4 a 30 caracteres validos."},
            status=400,
        )

    if "@" not in email or "." not in email:
        return JsonResponse({"ok": False, "error": "Ingresa un correo valido."}, status=400)

    if not re.fullmatch(r"\d{4}-\d{4}", telefono):
        return JsonResponse({"ok": False, "error": "El telefono debe tener el formato 7777-8888."}, status=400)

    if len(password) < 8:
        return JsonResponse({"ok": False, "error": "La contrasena debe tener al menos 8 caracteres."}, status=400)

    if password != confirmacion:
        return JsonResponse({"ok": False, "error": "Las contrasenas no coinciden."}, status=400)

    if Usuario.objects.filter(email=email).exists():
        return JsonResponse({"ok": False, "error": "Este correo ya esta registrado."}, status=409)

    if Usuario.objects.filter(username__iexact=username).exists():
        return JsonResponse({"ok": False, "error": "Este nombre de usuario ya esta en uso."}, status=409)

    usuario = Usuario.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=nombres,
        last_name=apellidos,
        telefono=telefono,
        rol=Usuario.Rol.CLIENTE,
        activo=True,
    )
    Cliente.objects.create(usuario=usuario)

    return JsonResponse({"ok": True, "usuario": serializar_usuario(usuario)}, status=201)


@require_POST
def cerrar_sesion(request):
    logout(request)
    return JsonResponse({"ok": True})


@require_GET
def usuario_actual(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesion activa."}, status=401)

    return JsonResponse({"ok": True, "usuario": serializar_usuario(request.user)})


@require_POST
def actualizar_perfil(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesion activa."}, status=401)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    nombre = datos.get("nombre", "").strip()
    email = datos.get("email", "").strip().lower()
    telefono = datos.get("telefono", "").strip()

    if not all([nombre, email, telefono]):
        return JsonResponse({"ok": False, "error": "Completa nombre, correo y telefono."}, status=400)

    if len(nombre) < 3:
        return JsonResponse({"ok": False, "error": "El nombre debe tener al menos 3 caracteres."}, status=400)

    if "@" not in email or "." not in email:
        return JsonResponse({"ok": False, "error": "Ingresa un correo valido."}, status=400)

    if not re.fullmatch(r"\d{4}-\d{4}", telefono):
        return JsonResponse({"ok": False, "error": "El telefono debe tener el formato 7777-8888."}, status=400)

    if Usuario.objects.filter(email=email).exclude(id=request.user.id).exists():
        return JsonResponse({"ok": False, "error": "Este correo ya esta en uso."}, status=409)

    partes = nombre.split()
    request.user.first_name = partes[0]
    request.user.last_name = " ".join(partes[1:])
    request.user.email = email
    request.user.telefono = telefono
    request.user.save()

    return JsonResponse({"ok": True, "usuario": serializar_usuario(request.user)})


@require_POST
def cambiar_password(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesion activa."}, status=401)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    actual = datos.get("actual", "")
    nueva = datos.get("nueva", "")
    confirmacion = datos.get("confirmacion", "")

    if not all([actual, nueva, confirmacion]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos de contrasena."}, status=400)

    if not request.user.check_password(actual):
        return JsonResponse({"ok": False, "error": "La contrasena actual no es correcta."}, status=400)

    if len(nueva) < 8:
        return JsonResponse({"ok": False, "error": "La nueva contrasena debe tener al menos 8 caracteres."}, status=400)

    if nueva != confirmacion:
        return JsonResponse({"ok": False, "error": "La nueva contrasena y la confirmacion no coinciden."}, status=400)

    request.user.set_password(nueva)
    request.user.save()
    update_session_auth_hash(request, request.user)

    return JsonResponse({"ok": True})
@require_GET
def listar_usuarios_admin(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    usuarios = Usuario.objects.all().order_by("rol", "username")
    data = [serializar_usuario(usuario) for usuario in usuarios]
    return JsonResponse({"ok": True, "usuarios": data, "total": len(data)})


@require_POST
def cambiar_estado_usuario(request, usuario_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    if request.user.id == usuario_id:
        return JsonResponse({"ok": False, "error": "No puedes desactivar tu propia cuenta."}, status=400)

    try:
        usuario = Usuario.objects.get(id=usuario_id)
    except Usuario.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Usuario no encontrado."}, status=404)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    activo = datos.get("activo")
    if not isinstance(activo, bool):
        return JsonResponse({"ok": False, "error": "Estado invalido."}, status=400)

    usuario.activo = activo
    usuario.save(update_fields=["activo", "actualizado_en"])
    return JsonResponse({"ok": True, "usuario": serializar_usuario(usuario)})


@require_POST
def resetear_password_usuario(request, usuario_id):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    try:
        usuario = Usuario.objects.get(id=usuario_id)
    except Usuario.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Usuario no encontrado."}, status=404)

    datos, error = obtener_datos_request(request)
    if error:
        return error

    password = datos.get("password", "")
    if len(password) < 8:
        return JsonResponse({"ok": False, "error": "La contrasena temporal debe tener al menos 8 caracteres."}, status=400)

    usuario.set_password(password)
    usuario.save()
    return JsonResponse({"ok": True})


@require_GET
def obtener_taller(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "error": "Sin sesion activa."}, status=401)

    return JsonResponse({"ok": True, "taller": serializar_taller(taller_actual())})


@require_POST
def actualizar_taller(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    datos, error = obtener_datos_request(request)
    if error:
        return error

    nombre = datos.get("nombre", "").strip()
    correo = datos.get("correo", "").strip().lower()
    direccion = datos.get("direccion", "").strip()
    telefono = datos.get("telefono", "").strip()
    whatsapp = datos.get("whatsapp", "").strip()
    horario = datos.get("horario", "").strip()

    if not all([nombre, correo, direccion, telefono, whatsapp, horario]):
        return JsonResponse({"ok": False, "error": "Completa todos los datos del taller."}, status=400)
    if "@" not in correo or "." not in correo:
        return JsonResponse({"ok": False, "error": "Ingresa un correo valido."}, status=400)
    if not re.fullmatch(r"\d{4}-\d{4}", telefono) or not re.fullmatch(r"\d{4}-\d{4}", whatsapp):
        return JsonResponse({"ok": False, "error": "Telefono y WhatsApp deben tener formato 7777-8888."}, status=400)

    taller = taller_actual()
    taller.nombre = nombre
    taller.correo = correo
    taller.direccion = direccion
    taller.telefono = telefono
    taller.whatsapp = whatsapp
    taller.horario = horario
    taller.save()
    return JsonResponse({"ok": True, "taller": serializar_taller(taller)})


@require_GET
def exportar_backup(request):
    permiso = validar_admin(request)
    if permiso:
        return permiso

    from apps.facturacion.models import Factura
    from apps.inventario.models import ProductoInventario
    from apps.servicios.models import SolicitudServicio
    from apps.soporte.models import TicketSoporte

    backup = {
        "taller": serializar_taller(taller_actual()),
        "usuarios": [serializar_usuario(usuario) for usuario in Usuario.objects.all()],
        "servicios": list(SolicitudServicio.objects.values()),
        "inventario": list(ProductoInventario.objects.values()),
        "facturas": list(Factura.objects.values()),
        "tickets": list(TicketSoporte.objects.values()),
    }
    return JsonResponse({"ok": True, "backup": backup})
