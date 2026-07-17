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

# Create your tests here.
