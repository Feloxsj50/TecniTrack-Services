import json

from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from apps.clientes.models import Cliente
from apps.usuarios.models import Usuario


def serializar_usuario(usuario):
    return {
        "id": usuario.id,
        "username": usuario.username,
        "nombre": usuario.get_full_name() or usuario.username,
        "email": usuario.email,
        "rol": usuario.rol,
    }


def obtener_datos_request(request):
    if request.content_type == "application/json":
        try:
            return json.loads(request.body.decode("utf-8")), None
        except json.JSONDecodeError:
            return None, JsonResponse({"ok": False, "error": "Datos invalidos."}, status=400)

    return request.POST, None


@csrf_exempt
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


@csrf_exempt
@require_POST
def registrar_cliente(request):
    datos, error = obtener_datos_request(request)
    if error:
        return error

    nombres = datos.get("nombres", "").strip()
    apellidos = datos.get("apellidos", "").strip()
    email = datos.get("email", "").strip().lower()
    telefono = datos.get("telefono", "").strip()
    password = datos.get("password", "")
    confirmacion = datos.get("confirmPassword", "")

    if not all([nombres, apellidos, email, telefono, password, confirmacion]):
        return JsonResponse({"ok": False, "error": "Completa todos los campos."}, status=400)

    if len(nombres) < 2 or len(apellidos) < 2:
        return JsonResponse({"ok": False, "error": "Nombre y apellido deben tener al menos 2 letras."}, status=400)

    if "@" not in email or "." not in email:
        return JsonResponse({"ok": False, "error": "Ingresa un correo valido."}, status=400)

    if len(password) < 8:
        return JsonResponse({"ok": False, "error": "La contrasena debe tener al menos 8 caracteres."}, status=400)

    if password != confirmacion:
        return JsonResponse({"ok": False, "error": "Las contrasenas no coinciden."}, status=400)

    if Usuario.objects.filter(email=email).exists():
        return JsonResponse({"ok": False, "error": "Este correo ya esta registrado."}, status=409)

    username_base = email.split("@")[0]
    username = username_base
    contador = 1
    while Usuario.objects.filter(username=username).exists():
        contador += 1
        username = f"{username_base}{contador}"

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
