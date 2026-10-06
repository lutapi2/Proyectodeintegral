#!/usr/bin/env python3
"""
AquaStream Executive | Servidor Web de Desarrollo Local
Director y desarrollador: Lucas Tapia
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class LuxuryHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Cabeceras para prevenir caché durante el desarrollo
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

def main():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), LuxuryHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 70)
        print("  AQUA-METRIC LUXE | HYDRO-ANALYTICS EXECUTIVE SUITE")
        print("  Director Científico: Lucas Tapia")
        print("=" * 70)
        print(f"  Servidor activo en: {url}")
        print("  Presiona Ctrl+C para detener el servidor.")
        print("=" * 70)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Servidor detenido exitosamente.")

if __name__ == "__main__":
    main()
