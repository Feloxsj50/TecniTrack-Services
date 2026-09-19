import json
from datetime import date
from decimal import Decimal

from django.db import connection
from django.test import Client, TestCase
from django.test.utils import CaptureQueriesContext

from apps.clientes.models import Cliente
from apps.garantias.services import crear_garantia, crear_reingreso
from apps.inventario.models import MovimientoInventario, ProductoInventario
from apps.servicios.models import SolicitudServicio
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Usuario
from .models import Factura


class FacturacionInventarioTests(TestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser("admin_fact", "admin@test.local", "AdminFact123!")
        self.admin.rol = Usuario.Rol.ADMIN
        self.admin.activo = True
        self.admin.save(update_fields=["rol", "activo"])
        cliente_usuario = Usuario.objects.create_user(
            "cliente_fact", password="ClienteFact123!", first_name="Cliente", last_name="Fact",
            email="cliente.fact@test.local", telefono="7777-2000", rol=Usuario.Rol.CLIENTE,
        )
        self.cliente = Cliente.objects.create(usuario=cliente_usuario)
        tecnico_usuario = Usuario.objects.create_user(
            "tecnico_fact", password="TecnicoFact123!", first_name="Tecnico", last_name="Fact",
            email="tecnico.fact@test.local", telefono="7777-2001", rol=Usuario.Rol.TECNICO,
        )
        self.tecnico = Tecnico.objects.create(usuario=tecnico_usuario, especialidad="Reparacion")
        self.orden = SolicitudServicio.objects.create(
            cliente=self.cliente, tecnico=self.tecnico, dispositivo="Laptop", problema="Cambio de bateria",
            fecha_preferida=date.today(), estado=SolicitudServicio.Estado.COMPLETADO,
            diagnostico="Trabajo terminado correctamente.",
        )
        self.producto = ProductoInventario.objects.create(
            nombre="Bateria de prueba", categoria=ProductoInventario.Categoria.BATERIAS,
            stock=2, stock_minimo=1, precio_compra=Decimal("20.00"), precio_venta=Decimal("35.00"),
            ubicacion="Estante A",
        )

    def cliente_admin(self):
        cliente = Client()
        cliente.force_login(self.admin)
        return cliente

    def datos_factura(self, **cambios):
        datos = {
            "solicitudId": self.orden.id,
            "montoServicio": "45.00",
            "productos": [],
            "metodoPago": "Efectivo",
            "estado": "Pagado",
            "garantia": "30 dias",
        }
        datos.update(cambios)
        return datos

    def guardar_factura(self, cliente=None, **cambios):
        return (cliente or self.cliente_admin()).post(
            "/facturacion/crear/",
            data=json.dumps(self.datos_factura(**cambios)),
            content_type="application/json",
        )

    def test_factura_descuenta_y_eliminar_factura_restaura_stock(self):
        admin_client = Client()
        self.assertTrue(admin_client.login(username="admin_fact", password="AdminFact123!"))
        respuesta = admin_client.post(
            "/facturacion/crear/",
            data=json.dumps({
                "solicitudId": self.orden.id,
                "montoServicio": "45.00",
                "productos": [{"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"}],
                "metodoPago": "Efectivo",
                "estado": "Pagado",
                "garantia": "30 dias",
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 201)
        factura = Factura.objects.get(solicitud=self.orden)
        self.producto.refresh_from_db()
        self.assertEqual(factura.total, Decimal("80.00"))
        self.assertEqual(self.producto.stock, 1)
        self.assertTrue(MovimientoInventario.objects.filter(tipo=MovimientoInventario.Tipo.SALIDA).exists())

        respuesta = admin_client.post(f"/facturacion/{factura.id}/eliminar/")
        self.assertEqual(respuesta.status_code, 200)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 2)
        self.assertFalse(Factura.objects.filter(id=factura.id).exists())

    def test_tecnico_no_puede_crear_facturas(self):
        tecnico_client = Client()
        self.assertTrue(tecnico_client.login(username="tecnico_fact", password="TecnicoFact123!"))
        respuesta = tecnico_client.post(
            "/facturacion/crear/",
            data=json.dumps({"solicitudId": self.orden.id, "montoServicio": "10.00", "productos": []}),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 403)

    def test_no_permite_usar_stock_insuficiente(self):
        self.producto.stock = 0
        self.producto.save(update_fields=["stock"])
        admin_client = Client()
        self.assertTrue(admin_client.login(username="admin_fact", password="AdminFact123!"))
        respuesta = admin_client.post(
            "/facturacion/crear/",
            data=json.dumps({
                "solicitudId": self.orden.id,
                "montoServicio": "45.00",
                "productos": [{"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"}],
            }),
            content_type="application/json",
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(Factura.objects.filter(solicitud=self.orden).exists())

    def test_segunda_creacion_devuelve_conflicto_y_no_descuenta_dos_veces(self):
        admin_client = self.cliente_admin()
        productos = [{"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"}]

        self.assertEqual(
            self.guardar_factura(admin_client, productos=productos).status_code,
            201,
        )
        self.assertEqual(
            self.guardar_factura(admin_client, productos=productos).status_code,
            409,
        )

        self.assertEqual(Factura.objects.filter(solicitud=self.orden).count(), 1)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 1)
        self.assertEqual(
            MovimientoInventario.objects.filter(tipo=MovimientoInventario.Tipo.SALIDA).count(),
            1,
        )

    def test_actualizacion_explicita_conserva_registro_y_numero(self):
        admin_client = self.cliente_admin()
        respuesta = self.guardar_factura(
            admin_client,
            productos=[{"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"}],
        )
        self.assertEqual(respuesta.status_code, 201)
        factura = Factura.objects.get(solicitud=self.orden)
        factura_id = factura.id
        numero = factura.numero

        respuesta = self.guardar_factura(
            admin_client,
            facturaId=factura.id,
            montoServicio="60.00",
            productos=[],
        )

        self.assertEqual(respuesta.status_code, 200)
        factura.refresh_from_db()
        self.producto.refresh_from_db()
        self.assertEqual(factura.id, factura_id)
        self.assertEqual(factura.numero, numero)
        self.assertEqual(factura.total, Decimal("60.00"))
        self.assertFalse(factura.inventario_descontado)
        self.assertEqual(self.producto.stock, 2)
        self.assertEqual(Factura.objects.filter(solicitud=self.orden).count(), 1)

    def test_rechaza_factura_id_perteneciente_a_otra_orden(self):
        admin_client = self.cliente_admin()
        self.assertEqual(self.guardar_factura(admin_client).status_code, 201)
        factura = Factura.objects.get(solicitud=self.orden)
        otra_orden = SolicitudServicio.objects.create(
            cliente=self.cliente,
            tecnico=self.tecnico,
            dispositivo="Otra laptop",
            problema="Cambio de pantalla",
            fecha_preferida=date.today(),
            estado=SolicitudServicio.Estado.COMPLETADO,
        )

        respuesta = self.guardar_factura(
            admin_client,
            solicitudId=otra_orden.id,
            facturaId=factura.id,
        )

        self.assertEqual(respuesta.status_code, 409)
        self.assertIn("no pertenece", respuesta.json()["error"])
        self.assertFalse(Factura.objects.filter(solicitud=otra_orden).exists())

    def test_stock_insuficiente_en_varios_productos_revierte_todo(self):
        producto_sin_stock = ProductoInventario.objects.create(
            nombre="Pantalla agotada",
            categoria=ProductoInventario.Categoria.PANTALLAS,
            stock=0,
            stock_minimo=1,
            precio_compra=Decimal("30.00"),
            precio_venta=Decimal("50.00"),
            ubicacion="Estante B",
        )

        respuesta = self.guardar_factura(
            productos=[
                {"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"},
                {"producto": producto_sin_stock.nombre, "cantidad": 1, "precio": "50.00"},
            ],
        )

        self.assertEqual(respuesta.status_code, 400)
        self.producto.refresh_from_db()
        producto_sin_stock.refresh_from_db()
        self.assertEqual(self.producto.stock, 2)
        self.assertEqual(producto_sin_stock.stock, 0)
        self.assertFalse(Factura.objects.filter(solicitud=self.orden).exists())
        self.assertFalse(MovimientoInventario.objects.exists())

    def test_actualizacion_fallida_conserva_factura_inventario_y_movimientos(self):
        admin_client = self.cliente_admin()
        self.assertEqual(
            self.guardar_factura(
                admin_client,
                productos=[{"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"}],
            ).status_code,
            201,
        )
        factura = Factura.objects.get(solicitud=self.orden)
        productos_originales = factura.productos
        total_original = factura.total
        movimientos_originales = MovimientoInventario.objects.count()
        producto_sin_stock = ProductoInventario.objects.create(
            nombre="SSD agotado",
            categoria=ProductoInventario.Categoria.ALMACENAMIENTO,
            stock=0,
            stock_minimo=1,
            precio_compra=Decimal("25.00"),
            precio_venta=Decimal("40.00"),
            ubicacion="Estante C",
        )

        respuesta = self.guardar_factura(
            admin_client,
            facturaId=factura.id,
            montoServicio="80.00",
            productos=[
                {"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"},
                {"producto": producto_sin_stock.nombre, "cantidad": 1, "precio": "40.00"},
            ],
        )

        self.assertEqual(respuesta.status_code, 400)
        factura.refresh_from_db()
        self.producto.refresh_from_db()
        producto_sin_stock.refresh_from_db()
        self.assertEqual(factura.productos, productos_originales)
        self.assertEqual(factura.total, total_original)
        self.assertEqual(self.producto.stock, 1)
        self.assertEqual(producto_sin_stock.stock, 0)
        self.assertEqual(MovimientoInventario.objects.count(), movimientos_originales)

    def test_cantidades_repetidas_se_consolidan_en_un_movimiento(self):
        self.producto.stock = 3
        self.producto.save(update_fields=["stock"])

        respuesta = self.guardar_factura(
            productos=[
                {"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"},
                {"producto": self.producto.codigo, "cantidad": 1, "precio": "35.00"},
            ],
        )

        self.assertEqual(respuesta.status_code, 201)
        self.producto.refresh_from_db()
        movimiento = MovimientoInventario.objects.get(tipo=MovimientoInventario.Tipo.SALIDA)
        self.assertEqual(self.producto.stock, 1)
        self.assertEqual(movimiento.cantidad, -2)

    def test_bloquea_orden_factura_y_productos_en_orden(self):
        admin_client = self.cliente_admin()
        self.assertEqual(
            self.guardar_factura(
                admin_client,
                productos=[{"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"}],
            ).status_code,
            201,
        )
        factura = Factura.objects.get(solicitud=self.orden)

        with CaptureQueriesContext(connection) as consultas:
            respuesta = self.guardar_factura(
                admin_client,
                facturaId=factura.id,
                productos=[{"producto": self.producto.nombre, "cantidad": 1, "precio": "35.00"}],
            )

        self.assertEqual(respuesta.status_code, 200)
        bloqueos = [
            consulta["sql"]
            for consulta in consultas.captured_queries
            if "FOR UPDATE" in consulta["sql"].upper()
        ]
        self.assertGreaterEqual(len(bloqueos), 3)
        self.assertIn("servicios_solicitudservicio", bloqueos[0])
        self.assertIn("facturacion_factura", bloqueos[1])
        self.assertIn("inventario_productoinventario", bloqueos[2])
        self.assertIn("ORDER BY", bloqueos[2].upper())
        self.assertIn('"inventario_productoinventario"."id" ASC', bloqueos[2])

    def test_reingreso_no_aparece_entre_servicios_facturables(self):
        garantia = crear_garantia(self.orden.id, 30, self.admin)
        reingreso = crear_reingreso(garantia.id, self.admin, "La falla se repitió")
        SolicitudServicio.objects.filter(pk=reingreso.solicitud_reingreso_id).update(
            estado=SolicitudServicio.Estado.COMPLETADO
        )
        admin_client = Client()
        admin_client.force_login(self.admin)

        respuesta = admin_client.get("/facturacion/servicios-completados/")

        self.assertEqual(respuesta.status_code, 200)
        ids = [item["id"] for item in respuesta.json()["servicios"]]
        self.assertIn(self.orden.id, ids)
        self.assertNotIn(reingreso.solicitud_reingreso_id, ids)

    def test_reingreso_no_puede_facturarse_ni_descontar_inventario(self):
        garantia = crear_garantia(self.orden.id, 30, self.admin)
        reingreso = crear_reingreso(garantia.id, self.admin, "La falla se repitió")
        SolicitudServicio.objects.filter(pk=reingreso.solicitud_reingreso_id).update(
            estado=SolicitudServicio.Estado.COMPLETADO
        )
        admin_client = Client()
        admin_client.force_login(self.admin)
        stock_inicial = self.producto.stock
        movimientos_iniciales = MovimientoInventario.objects.count()

        respuesta = admin_client.post(
            "/facturacion/crear/",
            data=json.dumps({
                "solicitudId": reingreso.solicitud_reingreso_id,
                "montoServicio": "45.00",
                "productos": [{
                    "producto": self.producto.nombre,
                    "cantidad": 1,
                    "precio": "35.00",
                }],
            }),
            content_type="application/json",
        )

        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("cubierta por garantía", respuesta.json()["error"])
        self.assertFalse(Factura.objects.filter(
            solicitud_id=reingreso.solicitud_reingreso_id
        ).exists())
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, stock_inicial)
        self.assertEqual(MovimientoInventario.objects.count(), movimientos_iniciales)
