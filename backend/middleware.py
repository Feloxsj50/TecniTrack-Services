from django.conf import settings
from django.http import HttpResponse


class DevCorsMiddleware:
    allowed_origins = {
        "null",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin")
        is_allowed = settings.DEBUG and origin in self.allowed_origins

        if is_allowed and request.method == "OPTIONS":
            response = HttpResponse()
        else:
            response = self.get_response(request)

        if is_allowed:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type, X-CSRFToken"
            response["Access-Control-Allow-Credentials"] = "true"

        return response
