import json
from decimal import Decimal
from unittest.mock import patch

from django.db import IntegrityError, connection
from django.test import Client, TestCase
from django.test.utils import CaptureQueriesContext

from apps.usuarios.models import Usuario

from .models import MovimientoInventario, ProductoInventario


class InventarioIntegridadTests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_user(
            username="admin_inventario",
            password="AdminInventario123!",
            email="admin.inventario@test.local",
            rol=Usuario.Rol.ADMIN,
            activo=True,
        )
        self.cliente = Client()
        self.cliente.force_login(self.admin)
        self.producto = ProductoInventario.objects.create(
            nombre="Bateria de inventario",
            categoria=ProductoInventario.Categoria.BATERIAS,
            proveedor="Proveedor de prueba",
            serie="BAT-001",
            stock=5,
            stock_minimo=1,
            precio_compra=Decimal("20.00"),
            precio_venta=Decimal("35.00"),
            ubicacion="Estante A",
            nota="Producto de prueba",
        )

    def datos_producto(self, **cambios):
        self.producto.refresh_from_db()
        datos = {
            "nombre": self.producto.nombre,
            "categoria": self.producto.categoria,
            "proveedor": self.producto.proveedor,
            "serie": self.producto.serie,
            "stock": self.producto.stock,
            "stockMinimo": self.producto.stock_minimo,
            "compra": str(self.producto.precio_compra),
            "venta": str(self.producto.precio_venta),
            "ubicacion": self.producto.ubicacion,
            "nota": self.producto.nota,
            "actualizadoEn": self.producto.actualizado_en.isoformat(),
        }
        datos.update(cambios)
        return datos

    def actualizar(self, datos):
        return self.cliente.post(
            f"/inventario/{self.producto.id}/actualizar/",
            data=json.dumps(datos),
            content_type="application/json",
        )

    def test_creacion_es_atomica_y_registra_movimiento_inicial(self):
        datos = self.datos_producto(
            nombre="SSD nuevo",
            categoria=ProductoInventario.Categoria.ALMACENAMIENTO,
            serie="SSD-001",
            stock=8,
        )
        datos.pop("actualizadoEn")

        respuesta = self.cliente.post(
            "/inventario/crear/",
            data=json.dumps(datos),
            content_type="application/json",
        )

        self.assertEqual(respuesta.status_code, 201)
        producto = ProductoInventario.objects.get(nombre="SSD nuevo")
        movimiento = MovimientoInventario.objects.get(producto=producto)
        self.assertEqual(movimiento.tipo, MovimientoInventario.Tipo.REGISTRO)
        self.assertEqual(movimiento.cantidad, 8)
        self.assertEqual(movimiento.stock_anterior, 0)
        self.assertEqual(movimiento.stock_nuevo, 8)
        self.assertEqual(movimiento.usuario, self.admin)

    def test_creacion_revierte_producto_si_falla_el_movimiento(self):
        datos = self.datos_producto(nombre="Producto que debe revertirse")
        datos.pop("actualizadoEn")

        with patch(
            "apps.inventario.views.MovimientoInventario.objects.create",
            side_effect=IntegrityError("fallo simulado"),
        ):
            respuesta = self.cliente.post(
                "/inventario/crear/",
                data=json.dumps(datos),
                content_type="application/json",
            )

        self.assertEqual(respuesta.status_code, 409)
        self.assertFalse(
            ProductoInventario.objects.filter(
                nombre="Producto que debe revertirse"
            ).exists()
        )

    def test_actualizacion_registra_un_ajuste_con_datos_completos(self):
        respuesta = self.actualizar(self.datos_producto(stock=8))

        self.assertEqual(respuesta.status_code, 200)
        self.producto.refresh_from_db()
        movimiento = MovimientoInventario.objects.get(producto=self.producto)
        self.assertEqual(self.producto.stock, 8)
        self.assertEqual(movimiento.tipo, MovimientoInventario.Tipo.AJUSTE)
        self.assertEqual(movimiento.cantidad, 3)
        self.assertEqual(movimiento.stock_anterior, 5)
        self.assertEqual(movimiento.stock_nuevo, 8)
        self.assertEqual(movimiento.usuario, self.admin)

    def test_actualizacion_sin_cambio_de_stock_no_crea_movimiento(self):
        respuesta = self.actualizar(
            self.datos_producto(nota="Cambio sin modificar existencias")
        )

        self.assertEqual(respuesta.status_code, 200)
        self.assertFalse(
            MovimientoInventario.objects.filter(producto=self.producto).exists()
        )

    def test_version_desactualizada_devuelve_409_sin_cambiar_stock(self):
        datos = self.datos_producto(stock=9)
        ProductoInventario.objects.filter(pk=self.producto.pk).update(stock=4)
        self.producto.refresh_from_db()
        self.producto.save(update_fields=["stock", "actualizado_en"])

        respuesta = self.actualizar(datos)

        self.assertEqual(respuesta.status_code, 409)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 4)
        self.assertFalse(
            MovimientoInventario.objects.filter(producto=self.producto).exists()
        )

    def test_version_ausente_o_invalida_devuelve_400(self):
        datos_sin_version = self.datos_producto(stock=6)
        datos_sin_version.pop("actualizadoEn")
        respuesta_sin_version = self.actualizar(datos_sin_version)

        datos_version_invalida = self.datos_producto(
            stock=6,
            actualizadoEn="version-invalida",
        )
        respuesta_version_invalida = self.actualizar(datos_version_invalida)

        self.assertEqual(respuesta_sin_version.status_code, 400)
        self.assertEqual(respuesta_version_invalida.status_code, 400)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 5)

    def test_rechaza_valores_de_stock_que_no_sean_enteros_validos(self):
        valores_invalidos = [-1, 1.5, True, "5", "", None, 2_147_483_648]

        for valor in valores_invalidos:
            with self.subTest(valor=valor):
                respuesta = self.actualizar(self.datos_producto(stock=valor))
                self.assertEqual(respuesta.status_code, 400)
                self.producto.refresh_from_db()
                self.assertEqual(self.producto.stock, 5)

        self.assertFalse(
            MovimientoInventario.objects.filter(producto=self.producto).exists()
        )

    def test_rechaza_stock_minimo_que_no_sea_entero_valido(self):
        respuesta = self.actualizar(self.datos_producto(stockMinimo=1.25))

        self.assertEqual(respuesta.status_code, 400)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_minimo, 1)

    def test_actualizacion_revierte_stock_si_falla_el_movimiento(self):
        with patch(
            "apps.inventario.views.MovimientoInventario.objects.create",
            side_effect=IntegrityError("fallo simulado"),
        ):
            respuesta = self.actualizar(self.datos_producto(stock=9))

        self.assertEqual(respuesta.status_code, 409)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 5)
        self.assertFalse(
            MovimientoInventario.objects.filter(producto=self.producto).exists()
        )

    def test_actualizacion_bloquea_producto_ordenado_por_id(self):
        with CaptureQueriesContext(connection) as consultas:
            respuesta = self.actualizar(self.datos_producto(stock=6))

        self.assertEqual(respuesta.status_code, 200)
        bloqueos = [
            consulta["sql"]
            for consulta in consultas.captured_queries
            if "FOR UPDATE" in consulta["sql"].upper()
            and "inventario_productoinventario" in consulta["sql"]
        ]
        self.assertEqual(len(bloqueos), 1)
        self.assertIn("FOR UPDATE OF", bloqueos[0].upper())
        self.assertIn("ORDER BY", bloqueos[0].upper())
        self.assertIn('"inventario_productoinventario"."id" ASC', bloqueos[0])

    def test_desactivacion_bloquea_producto(self):
        with CaptureQueriesContext(connection) as consultas:
            respuesta = self.cliente.post(
                f"/inventario/{self.producto.id}/eliminar/"
            )

        self.assertEqual(respuesta.status_code, 200)
        self.producto.refresh_from_db()
        self.assertFalse(self.producto.activo)
        bloqueos = [
            consulta["sql"]
            for consulta in consultas.captured_queries
            if "FOR UPDATE" in consulta["sql"].upper()
            and "inventario_productoinventario" in consulta["sql"]
        ]
        self.assertEqual(len(bloqueos), 1)
        self.assertIn("FOR UPDATE OF", bloqueos[0].upper())

    def test_usuario_no_administrador_no_puede_modificar_stock(self):
        tecnico = Usuario.objects.create_user(
            username="tecnico_sin_permiso_inventario",
            password="TecnicoInventario123!",
            email="tecnico.sin.permiso@test.local",
            rol=Usuario.Rol.TECNICO,
            activo=True,
        )
        cliente_tecnico = Client()
        cliente_tecnico.force_login(tecnico)

        respuesta = cliente_tecnico.post(
            f"/inventario/{self.producto.id}/actualizar/",
            data=json.dumps(self.datos_producto(stock=9)),
            content_type="application/json",
        )

        self.assertEqual(respuesta.status_code, 403)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 5)
        self.assertFalse(
            MovimientoInventario.objects.filter(producto=self.producto).exists()
        )
