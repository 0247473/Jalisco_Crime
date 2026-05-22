"""
Jalisco Crime Dashboard - Backend API
A FastAPI service providing crime statistics and geographic data for Jalisco (2020-2025)

Endpoints:
- GET /health - Health check endpoint for Kubernetes probes
- GET /api/summary - Aggregate statistics for dashboard cards and charts
- GET /api/points - Individual crime points with optional filters for Leaflet
- GET /api/trends - Temporal trends by crime type
- GET /api/filters - Available filter options for dropdown selectors
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import json
import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

# Configuración del sistema de Logs para auditoría en Kubernetes
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Inicialización de FastAPI con metadatos descriptivos
app = FastAPI(
    title="Jalisco Crime API",
    description="REST API for Jalisco crime statistics and visualization",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configuración de CORS para permitir la interconexión con el Pod de Nginx (Frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

# Ruta del volumen de datos (Sobrescribible por variables de entorno en el Deployment de K8s)
DATA_PATH = os.getenv("DATA_PATH", "/app/data/crime_data.json")
DATA: Dict[str, Any] = {}

# Carga inicial del dataset con manejo estricto de codificación y tolerancia a fallos
try:
    if os.path.exists(DATA_PATH):
        # Abrimos forzando UTF-8 y eliminando caracteres binarios rotos (evita colapsos e HTTP 500)
        with open(DATA_PATH, "r", encoding="utf-8", errors="ignore") as f:
            DATA = json.load(f)
        logger.info(f"✅ Dataset cargado correctamente desde {DATA_PATH}")
    else:
        logger.error(f"❌ Archivo no encontrado en la ruta de datos establecida: {DATA_PATH}")
        DATA = {}
except json.JSONDecodeError as je:
    logger.error(f"❌ Error fatal de parseo estructural en el archivo JSON: {je}")
    DATA = {}
except Exception as e:
    logger.error(f"❌ Error crítico inesperado durante la inicialización del backend: {e}")
    DATA = {}

# Estructura fallback obligatoria en memoria si el JSON base falla, garantizando que el API nunca muera
if not DATA:
    DATA = {
        "total_records": 0,
        "by_year": [],
        "top_delitos": [],
        "by_municipio": [],
        "sample": []
    }


@app.get("/health", tags=["Utility"])
def health_check():
    """Endpoint de monitoreo (Liveness/Readiness probe) para orquestación en Kubernetes."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "records_loaded": DATA.get("total_records", 0) > 0,
        "total_count": DATA.get("total_records", 0)
    }


@app.get("/api/summary", tags=["Analytics"])
def get_summary():
    """Retorna las estadísticas globales precalculadas para las tarjetas informativas y Chart.js."""
    try:
        return {
            "total_records": DATA.get("total_records", 0),
            "by_year": DATA.get("by_year", []),
            "top_delitos": DATA.get("top_delitos", []),
            "by_municipio": DATA.get("by_municipio", [])
        }
    except Exception as e:
        logger.error(f"Error procesando petición en /api/summary: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving summary data")


@app.get("/api/points", tags=["Geospatial"])
def get_points(
    delito: Optional[str] = Query(None, description="Filtrar puntos por tipo de delito"),
    municipio: Optional[str] = Query(None, description="Filtrar puntos por municipio")
):
    """
    Retorna las coordenadas geográficas de los incidentes mapeados dentro del vector 'sample'.
    Aplica una cuota máxima de renderizado (2,000 puntos) para proteger la estabilidad del navegador.
    """
    try:
        points = DATA.get("sample", [])
        filtered_points = points

        # Filtros dinámicos insensibles a mayúsculas/minúsculas
        if delito:
            filtered_points = [p for p in filtered_points if p.get("delito", "").upper() == delito.upper()]
        if municipio:
            filtered_points = [p for p in filtered_points if p.get("municipio", "").upper() == municipio.upper()]

        return filtered_points[:2000]
    except Exception as e:
        logger.error(f"Error procesando coordenadas en /api/points: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving spatial points")


@app.get("/api/trends", tags=["Analytics"])
def get_trends(delito: Optional[str] = Query(None, description="Filtrar tendencias por tipo de delito")):
    """Calcula y proyecta las líneas temporales de incidentes de forma dinámica o agregada."""
    try:
        # Si no se especifica un delito, se retorna el comportamiento analítico anual por defecto
        if not delito:
            return DATA.get("by_year", [])
            
        points = DATA.get("sample", [])
        year_counts = {}
        
        for p in points:
            if p.get("delito", "").upper() == delito.upper():
                try:
                    year = datetime.strptime(p.get("fecha", ""), "%Y-%m-%d").year
                    year_counts[year] = year_counts.get(year, 0) + 1
                except:
                    continue
                    
        return [{"año": k, "total": v} for k, v in sorted(year_counts.items())]
    except Exception as e:
        logger.error(f"Error procesando líneas de tendencia en /api/trends: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving trend data")


@app.get("/api/filters", tags=["Metadata"])
def filters():
    """Genera las listas de normalización para los selectores dinámicos del Dashboard."""
    try:
        # Si el JSON no trae las listas planas precalculadas, las extraemos bajo demanda de la muestra
        delitos_set = set()
        municipios_set = set()
        
        for p in DATA.get("sample", []):
            if p.get("delito"): delitos_set.add(p["delito"])
            if p.get("municipio"): municipios_set.add(p["municipio"])
            
        delitos_list = sorted(list(delitos_set))
        municipios_list = sorted(list(municipios_set))
        
        return {
            "delitos": DATA.get("delitos_list", delitos_list),
            "municipios": DATA.get("municipios_list", municipios_list),
            "delitos_count": len(DATA.get("delitos_list", delitos_list)),
            "municipios_count": len(DATA.get("municipios_list", municipios_list))
        }
    except Exception as e:
        logger.error(f"Error construyendo catálogos en /api/filters: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving filter data")


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Manejador global de excepciones para evitar fugas de información y unificar trazas JSON."""
    logger.error(f"Excepción global interceptada en el nodo: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error occurred within the cluster node.",
            "timestamp": datetime.utcnow().isoformat()
        }
    )


@app.on_event("startup")
async def startup_event():
    """Log de inicialización informativa con el resumen analítico del volumen inyectado."""
    logger.info("🚀 Jalisco Crime API levantada y sincronizando...")
    logger.info(f"📊 Destino físico asignado: {DATA_PATH}")
    logger.info(f"📈 Registros cargados con éxito en memoria: {DATA.get('total_records', 0)}")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("🛑 Jalisco Crime API shutting down...")