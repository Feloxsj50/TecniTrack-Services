import json

from django.core.cache import cache
from django.test import Client, TestCase

from .models import Usuario


class SeguridadLoginTests(TestCase):
    def setUp(self):
        cache.clear()
        Usuario.objects.create_user(
            username="login_seguro", password="LoginSeguro123!", rol=Usuario.Rol.CLIENTE,
            email="login.seguro@test.local",
        )

    def tearDown(self):
        cache.clear()

    def test_bloquea_reintentos_fallidos(self):
        cliente = Client()
        datos = json.dumps({"usuario": "login_seguro", "password": "incorrecta"})
        for _ in range(5):
            self.assertEqual(cliente.post("/usuarios/login/", data=datos, content_type="application/json").status_code, 401)
        respuesta = cliente.post("/usuarios/login/", data=datos, content_type="application/json")
        self.assertEqual(respuesta.status_code, 429)


class ValidacionRegistroTests(TestCase):
    def test_rechaza_telefono_con_formato_invalido(self):
        respuesta = Client().post(
            "/usuarios/registro/",
            data=json.dumps({
                "nombres": "Cliente", "apellidos": "Prueba", "username": "cliente_nuevo",
                "email": "nuevo@test.local", "telefono": "77778888",
                "password": "ClienteNuevo123!", "confirmPassword": "ClienteNuevo123!",
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 400)

    def test_rechaza_usuario_duplicado(self):
        Usuario.objects.create_user(
            username="cliente_existente", password="Cliente123!", email="existente@test.local",
        )
        respuesta = Client().post(
            "/usuarios/registro/",
            data=json.dumps({
                "nombres": "Otro", "apellidos": "Cliente", "username": "cliente_existente",
                "email": "otro@test.local", "telefono": "7777-1234",
                "password": "ClienteNuevo123!", "confirmPassword": "ClienteNuevo123!",
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 409)

# Create your tests here.
