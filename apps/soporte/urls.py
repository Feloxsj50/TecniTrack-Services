from django.urls import path

from . import views

app_name = "soporte"

urlpatterns = [
    path("", views.listar_tickets, name="listar_tickets"),
    path("crear/", views.crear_ticket, name="crear_ticket"),
    path("<int:ticket_id>/responder/", views.responder_ticket, name="responder_ticket"),
]