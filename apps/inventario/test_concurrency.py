import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from threading import Barrier

from django.db import close_old_connections
from django.test import Client, TransactionTestCase

from apps.clientes.models import Cliente
from apps.facturacion.models import Factura
from apps.servicios.models import SolicitudServicio
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Usuario

from .models import MovimientoInventario, ProductoInventario


class InventarioConcurrenciaTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.password_admin = "AdminInventarioConcurrente123!"
        self.admin = Usuario.objects.create_user(
            username="admin_inventario_concurrente",
            password=self.password_admin,
            email="admin.inventario.concurrente@test.local",
            rol=Usuario.Rol.ADMIN,
            activo=True,
        )
        cliente_usuario = Usuario.objects.create_user(
            username="cliente_inventario_concurrente",
            password="ClienteInventarioConcurrente123!",
            email="cliente.inventario.concurrente@test.local",
            rol=Usuario.Rol.CLIENTE,
            activo=True,
        )
        cliente = Cliente.objects.create(usuario=cliente_usuario)
        tecnico_usuario = Usuario.objects.create_user(
            username="tecnico_inventario_concurrente",
            password="TecnicoInventarioConcurrente123!",
            email="tecnico.inventario.concurrente@test.local",
            rol=Usuario.Rol.TECNICO,
            activo=True,
        )
        tecnico = Tecnico.objects.create(
            usuario=tecnico_usuario,
            especialidad="Reparacion",
        )
        self.orden = SolicitudServicio.objects.create(
            cliente=cliente,
            tecnico=tecnico,
            dispositivo="Laptop concurrente",
            problema="Cambio de bateria",
            fecha_preferida=date.today(),
            estado=SolicitudServicio.Estado.COMPLETADO,
        )
        self.producto = ProductoInventario.objects.create(
            nombre="Bateria concurrente de inventario",
            categoria=ProductoInventario.Categoria.BATERIAS,
            proveedor="Proveedor concurrente",
            serie="BAT-CON-001",
            stock=2,
            stock_minimo=1,
            precio_compra=Decimal("20.00"),
            precio_venta=Decimal("35.00"),
            ubicacion="Estante concurrente",
            nota="Producto para concurrencia",
        )

    def datos_producto(self, stock, version):
        return {
            "nombre": self.producto.nombre,
            "categoria": self.producto.categoria,
            "proveedor": self.producto.proveedor,
            "serie": self.producto.serie,
            "stock": stock,
            "stockMinimo": self.producto.stock_minimo,
            "compra": str(self.producto.precio_compra),
            "venta": str(self.producto.precio_venta),
            "ubicacion": self.producto.ubicacion,
            "nota": self.producto.nota,
            "actualizadoEn": version,
        }

    def cliente_admin(self):
        cliente = Client()
        autenticado = cliente.login(
            username=self.admin.username,
            password=self.password_admin,
        )
        if not autenticado:
            raise AssertionError("No se pudo iniciar la sesion de prueba.")
        return cliente

    def actualizar_en_hilo(self, stock, version, barrera):
        close_old_connections()
        try:
            cliente = self.cliente_admin()
            barrera.wait(timeout=10)
            respuesta = cliente.post(
                f"/inventario/{self.producto.id}/actualizar/",
                data=json.dumps(self.datos_producto(stock, version)),
                content_type="application/json",
            )
            return respuesta.status_code, respuesta.json()
        finally:
            close_old_connections()

    def facturar_en_hilo(self, barrera):
        close_old_connections()
        try:
            cliente = self.cliente_admin()
            barrera.wait(timeout=10)
            respuesta = cliente.post(
                "/facturacion/crear/",
                data=json.dumps({
                    "solicitudId": self.orden.id,
                    "montoServicio": "45.00",
                    "productos": [{
                        "producto": self.producto.nombre,
                        "cantidad": 1,
                        "precio": "35.00",
                    }],
                    "metodoPago": "Efectivo",
                    "estado": "Pagado",
                }),
                content_type="application/json",
            )
            return respuesta.status_code, respuesta.json()
        finally:
            close_old_connections()

    def desactivar_en_hilo(self, barrera):
        close_old_connections()
        try:
            cliente = self.cliente_admin()
            barrera.wait(timeout=10)
            respuesta = cliente.post(
                f"/inventario/{self.producto.id}/eliminar/"
            )
            return respuesta.status_code, respuesta.json()
        finally:
            close_old_connections()

    def test_dos_ediciones_manual_concurrentes_no_se_sobrescriben(self):
        version = self.producto.actualizado_en.isoformat()
        barrera = Barrier(2)

        with ThreadPoolExecutor(max_workers=2) as executor:
            futuros = [
                executor.submit(self.actualizar_en_hilo, 5, version, barrera),
                executor.submit(self.actualizar_en_hilo, 8, version, barrera),
            ]
            resultados = [futuro.result(timeout=30) for futuro in futuros]

        self.assertEqual(sorted(estado for estado, _ in resultados), [200, 409])
        self.producto.refresh_from_db()
        self.assertIn(self.producto.stock, [5, 8])
        movimientos = MovimientoInventario.objects.filter(
            producto=self.producto,
            tipo=MovimientoInventario.Tipo.AJUSTE,
        )
        self.assertEqual(movimientos.count(), 1)
        self.assertEqual(movimientos.get().stock_nuevo, self.producto.stock)

    def test_edicion_manual_y_facturacion_conservan_el_descuento(self):
        version = self.producto.actualizado_en.isoformat()
        barrera = Barrier(2)

        with ThreadPoolExecutor(max_workers=2) as executor:
            futuro_manual = executor.submit(
                self.actualizar_en_hilo,
                5,
                version,
                barrera,
            )
            futuro_factura = executor.submit(self.facturar_en_hilo, barrera)
            resultado_manual = futuro_manual.result(timeout=30)
            resultado_factura = futuro_factura.result(timeout=30)

        self.assertEqual(resultado_factura[0], 201)
        self.assertIn(resultado_manual[0], [200, 409])
        self.assertEqual(Factura.objects.filter(solicitud=self.orden).count(), 1)

        self.producto.refresh_from_db()
        if resultado_manual[0] == 200:
            self.assertEqual(self.producto.stock, 4)
        else:
            self.assertEqual(self.producto.stock, 1)

        movimientos = list(
            MovimientoInventario.objects.filter(producto=self.producto).order_by("id")
        )
        stock_encadenado = 2
        for movimiento in movimientos:
            self.assertEqual(movimiento.stock_anterior, stock_encadenado)
            stock_encadenado = movimiento.stock_nuevo
        self.assertEqual(stock_encadenado, self.producto.stock)
        self.assertEqual(
            sum(
                movimiento.tipo == MovimientoInventario.Tipo.SALIDA
                for movimiento in movimientos
            ),
            1,
        )

    def test_desactivacion_y_facturacion_quedan_serializadas(self):
        barrera = Barrier(2)

        with ThreadPoolExecutor(max_workers=2) as executor:
            futuro_desactivacion = executor.submit(
                self.desactivar_en_hilo,
                barrera,
            )
            futuro_factura = executor.submit(self.facturar_en_hilo, barrera)
            resultado_desactivacion = futuro_desactivacion.result(timeout=30)
            resultado_factura = futuro_factura.result(timeout=30)

        self.assertEqual(resultado_desactivacion[0], 200)
        self.assertIn(resultado_factura[0], [201, 400])
        self.producto.refresh_from_db()
        self.assertFalse(self.producto.activo)

        if resultado_factura[0] == 201:
            self.assertEqual(self.producto.stock, 1)
            self.assertTrue(Factura.objects.filter(solicitud=self.orden).exists())
        else:
            self.assertEqual(self.producto.stock, 2)
            self.assertFalse(Factura.objects.filter(solicitud=self.orden).exists())
