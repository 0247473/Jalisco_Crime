# 🏗️ Architecture Documentation

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Component Details](#component-details)
- [Data Flow](#data-flow)
- [Network Architecture](#network-architecture)
- [Scaling Strategy](#scaling-strategy)
- [Design Decisions](#design-decisions)
- [Security Architecture](#security-architecture)

---

## Overview

The Jalisco Crime Dashboard is a **cloud-native microservices application** deployed on Kubernetes. It follows modern architectural patterns including:

- **Separation of Concerns**: Frontend and backend are independent services
- **Stateless Design**: Both services can scale horizontally without session affinity
- **Service-Oriented Architecture**: Services communicate via well-defined REST APIs
- **Infrastructure as Code**: All infrastructure defined in version-controlled YAML manifests
- **12-Factor App Principles**: Configuration via environment, stateless processes, port binding

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         EXTERNAL USERS                           │
│                      (Web Browsers)                              │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTPS (Production) / HTTP (Demo)
                      ↓
┌─────────────────────────────────────────────────────────────────┐
│                    INGRESS CONTROLLER                            │
│              (Optional - Production deployment)                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Rules:                                                   │   │
│  │  - / → frontend-service                                   │   │
│  │  - /api/* → backend-service                              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────┬────────────────────┬────────────────────────┘
                      │                    │
        ┌─────────────┘                    └────────────┐
        ↓                                               ↓
┌──────────────────────────────┐    ┌──────────────────────────────┐
│   FRONTEND SERVICE           │    │   BACKEND SERVICE            │
│   Type: NodePort (Demo)      │    │   Type: ClusterIP            │
│   Port: 80                   │    │   Port: 8000                 │
│   NodePort: 30080            │    │   Internal DNS:              │
│                              │    │   crime-backend-svc:8000     │
└───────────┬──────────────────┘    └──────────┬───────────────────┘
            │                                  │
            │ Load Balances                    │ Load Balances
            ↓                                  ↓
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  FRONTEND DEPLOYMENT         │    │  BACKEND DEPLOYMENT          │
│  ┌────────────────────────┐  │    │  ┌────────────────────────┐  │
│  │  Pod 1                 │  │    │  │  Pod 1                 │  │
│  │  ┌──────────────────┐  │  │    │  │  ┌──────────────────┐  │  │
│  │  │  Nginx Container │  │  │    │  │  │  FastAPI         │  │  │
│  │  │  - index.html    │  │  │    │  │  │  - main.py       │  │  │
│  │  │  - styles.css    │  │  │    │  │  │  - Uvicorn       │  │  │
│  │  │  - app.js        │  │  │    │  │  │  Port: 8000      │  │  │
│  │  │  Port: 80        │  │  │    │  │  └──────────────────┘  │  │
│  │  └──────────────────┘  │  │    │  │  Volume:               │  │
│  │  Resources:             │  │    │  │  - /app/data ← ConfigMap│
│  │  - CPU: 50m-200m       │  │    │  │  Resources:            │  │
│  │  - Mem: 64Mi-128Mi     │  │    │  │  - CPU: 100m-500m      │  │
│  └────────────────────────┘  │    │  │  - Mem: 128Mi-512Mi    │  │
│                              │    │  │  Probes:               │  │
│  ┌────────────────────────┐  │    │  │  - Readiness: /health  │  │
│  │  Pod 2 (same spec)     │  │    │  │  - Liveness: /health   │  │
│  └────────────────────────┘  │    │  └────────────────────────┘  │
│                              │    │                              │
│  Replicas: 2 (fixed)         │    │  ┌────────────────────────┐  │
└──────────────────────────────┘    │  │  Pod 2 (same spec)     │  │
                                    │  └────────────────────────┘  │
                                    │                              │
                                    │  ┌────────────────────────┐  │
                                    │  │  Pod 3-6 (dynamic)     │  │
                                    │  │  Created by HPA        │  │
                                    │  └────────────────────────┘  │
                                    │                              │
                                    │  Replicas: 2-6 (dynamic)     │
                                    └──────────────────────────────┘
                                               ↑
                                               │ Monitors & Scales
                                    ┌──────────────────────────────┐
                                    │  HORIZONTAL POD AUTOSCALER   │
                                    │  - Target: 60% CPU           │
                                    │  - Min: 2 replicas           │
                                    │  - Max: 6 replicas           │
                                    │  - Check: Every 15s          │
                                    └──────────────────────────────┘
                                               ↑
                                               │ Metrics
                                    ┌──────────────────────────────┐
                                    │  METRICS SERVER              │
                                    │  - Collects CPU/Memory       │
                                    │  - Polls every 60s           │
                                    └──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      SUPPORTING RESOURCES                        │
│  ┌────────────────────┐  ┌────────────────────┐                │
│  │  ConfigMap         │  │  Namespace         │                │
│  │  crime-data        │  │  crime-dashboard   │                │
│  │  - crime_data.json │  │  - ResourceQuota   │                │
│  │  - 357K records    │  │  - LimitRange      │                │
│  └────────────────────┘  └────────────────────┘                │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                │
│  │  NetworkPolicy     │  │  PersistentVolume  │                │
│  │  - Frontend rules  │  │  (Future: for DB)  │                │
│  │  - Backend rules   │  │                    │                │
│  └────────────────────┘  └────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### Frontend Service

**Technology Stack:**
- **Web Server**: Nginx 1.25-alpine
- **Framework**: Vanilla JavaScript (ES6+)
- **Mapping**: Leaflet 1.9.4 + OpenStreetMap
- **Charts**: Chart.js 4.4.0
- **Styling**: Custom CSS3 with Flexbox/Grid

**Responsibilities:**
1. Serve static assets (HTML, CSS, JS)
2. Render interactive map with crime point markers
3. Display charts and summary statistics
4. Handle user interactions (filtering, zooming)
5. Make API calls to backend service

**Design Patterns:**
- **Single Page Application (SPA)**: No page reloads, dynamic content updates
- **Separation of Concerns**: HTML (structure), CSS (presentation), JS (behavior)
- **Progressive Enhancement**: Works without JavaScript for basic content
- **Responsive Design**: Mobile-first approach with breakpoints

**Files:**
- `index.html`: DOM structure, semantic HTML5
- `styles.css`: Responsive styles, CSS Grid layouts
- `app.js`: API client, data rendering, event handlers
- `nginx.conf`: Server configuration, security headers, gzip

**Container Specifications:**
```yaml
Image: nginx:1.25-alpine
Base Size: ~40MB
Resources:
  Requests: 50m CPU, 64Mi Memory
  Limits: 200m CPU, 128Mi Memory
Ports: 80 (HTTP)
Health: GET /health
Security: Non-root user (UID 1001)
```

---

### Backend Service

**Technology Stack:**
- **Framework**: FastAPI 0.111.0
- **Server**: Uvicorn 0.30.1 (ASGI)
- **Language**: Python 3.11+
- **Data Format**: JSON (in-memory)

**Responsibilities:**
1. Serve REST API endpoints
2. Load and parse crime data from ConfigMap
3. Filter and aggregate data based on query parameters
4. Validate input parameters
5. Return JSON responses
6. Provide health check endpoint for Kubernetes

**API Endpoints:**
```python
GET /health
    → {"status": "healthy", "total_records": 357164}

GET /api/summary
    → Aggregate statistics (total, by year, top crimes)

GET /api/points?delito=Robo&municipio=Guadalajara&limit=2000
    → Filtered crime point coordinates for map

GET /api/trends?delito=Robo
    → Temporal trend data for charting

GET /api/filters
    → Available crime types and municipalities
```

**Design Patterns:**
- **RESTful API**: Stateless, resource-based URLs
- **Repository Pattern**: Data access abstracted in DATA dictionary
- **Dependency Injection**: FastAPI's Query parameters
- **Error Handling**: Centralized exception handlers
- **Validation**: Pydantic models for request validation

**Container Specifications:**
```yaml
Image: crime-backend:latest
Base: python:3.11-slim (~150MB)
Resources:
  Requests: 100m CPU, 128Mi Memory
  Limits: 500m CPU, 512Mi Memory
Ports: 8000 (HTTP)
Health: GET /health (readiness + liveness)
Security: Non-root user (UID 1001)
Volumes: /app/data (ConfigMap mount)
```

---

### Kubernetes Services

#### Frontend Service (NodePort)
```yaml
Type: NodePort
Purpose: External access to frontend
Port Mapping: 80 (service) → 80 (pod) → 30080 (node)
Selector: app=crime-frontend
Session Affinity: ClientIP (sticky sessions)
```

**Why NodePort?**
- Minikube doesn't have external load balancer
- Provides stable external access
- Simple for demo/development
- Production would use LoadBalancer or Ingress

#### Backend Service (ClusterIP)
```yaml
Type: ClusterIP
Purpose: Internal service discovery
Internal DNS: crime-backend-svc.default.svc.cluster.local
Port: 8000
Selector: app=crime-backend
Load Balancing: Round-robin across pods
```

**Why ClusterIP?**
- Backend should not be directly accessible externally
- Enables service discovery via DNS
- Automatic load balancing
- Kubernetes-native networking

---

### Horizontal Pod Autoscaler (HPA)

**Configuration:**
```yaml
Target: Deployment/crime-backend
Metrics: CPU utilization
Target Threshold: 60%
Min Replicas: 2
Max Replicas: 6
Scale Up: Immediate
Scale Down: 5-minute stabilization window
```

**Scaling Algorithm:**
```
desiredReplicas = ceil(currentReplicas × (currentMetric / targetMetric))

Example:
- Current: 2 replicas at 90% CPU
- Target: 60% CPU
- Calculation: ceil(2 × (90/60)) = ceil(3) = 3 replicas
```

**Scaling Behavior:**
```yaml
scaleUp:
  stabilizationWindowSeconds: 0  # Immediate
  policies:
  - type: Percent
    value: 100  # Double replicas
    periodSeconds: 60
  - type: Pods
    value: 2    # Max 2 pods per minute

scaleDown:
  stabilizationWindowSeconds: 300  # 5 minutes
  policies:
  - type: Percent
    value: 50   # Remove max 50% of pods
    periodSeconds: 60
  - type: Pods
    value: 1    # Remove max 1 pod per minute
```

**Why These Settings?**
- **2 min replicas**: High availability (one pod can fail)
- **6 max replicas**: Balance cost vs capacity
- **60% CPU**: Headroom for traffic spikes
- **5-min scale-down**: Prevent flapping

---

## Data Flow

### User Opens Dashboard

```
┌─────────┐
│ Browser │
└────┬────┘
     │ 1. HTTP GET http://<minikube-ip>:30080/
     ↓
┌─────────────────┐
│ NodePort :30080 │ (Minikube node)
└────┬────────────┘
     │ 2. Route to frontend Service
     ↓
┌──────────────────────┐
│ Frontend Service     │
│ ClusterIP: 10.96.x.x │
└────┬─────────────────┘
     │ 3. Load balance to pod
     ↓
┌────────────────────┐
│ Frontend Pod       │
│ Nginx:80           │
│ ┌────────────────┐ │
│ │ Serves         │ │
│ │ - index.html   │ │
│ │ - styles.css   │ │
│ │ - app.js       │ │
│ └────────────────┘ │
└────────────────────┘
     │ 4. HTTP 200 + HTML
     ↓
┌─────────┐
│ Browser │ Renders page
└─────────┘
```

### Frontend Calls Backend API

```
┌─────────┐
│ Browser │
└────┬────┘
     │ 1. JavaScript: fetch('http://localhost:8000/api/summary')
     ↓
┌──────────────────┐
│ kubectl          │
│ port-forward     │ (Developer's terminal)
└────┬─────────────┘
     │ 2. Tunnel to backend Service
     ↓
┌──────────────────────┐
│ Backend Service      │
│ ClusterIP: 10.96.x.y │
└────┬─────────────────┘
     │ 3. Load balance to pod
     ↓
┌────────────────────┐
│ Backend Pod        │
│ FastAPI:8000       │
│ ┌────────────────┐ │
│ │ main.py        │ │
│ │ @app.get()     │ │
│ │ ↓              │ │
│ │ Read DATA      │ │
│ │ ↓              │ │
│ │ Filter data    │ │
│ │ ↓              │ │
│ │ Return JSON    │ │
│ └────────────────┘ │
│         ↑          │
│         │ Mounted  │
│ ┌───────────────┐  │
│ │ /app/data/    │  │
│ │ ConfigMap     │  │
│ └───────────────┘  │
└────────────────────┘
     │ 4. HTTP 200 + JSON
     ↓
┌─────────┐
│ Browser │ Updates map/charts
└─────────┘
```

### Autoscaling Flow

```
┌──────────────────┐
│ Backend Pods     │ CPU usage increases (heavy load)
│ 2 replicas @ 80% │
└────────┬─────────┘
         │ 1. kubelet reports metrics
         ↓
┌──────────────────┐
│ Metrics Server   │ Aggregates metrics
└────────┬─────────┘
         │ 2. HPA queries metrics every 15s
         ↓
┌──────────────────────┐
│ HPA Controller       │ Calculates: 2 × (80/60) = 2.67 → 3 replicas
└────────┬─────────────┘
         │ 3. Updates Deployment spec: replicas=3
         ↓
┌──────────────────────┐
│ Deployment Controller│ Detects desired ≠ actual
└────────┬─────────────┘
         │ 4. Creates new ReplicaSet
         ↓
┌──────────────────────┐
│ ReplicaSet Controller│ Creates 1 new pod
└────────┬─────────────┘
         │ 5. Submits pod spec
         ↓
┌──────────────────────┐
│ Scheduler            │ Finds node with resources
└────────┬─────────────┘
         │ 6. Assigns pod to node
         ↓
┌──────────────────────┐
│ kubelet (on node)    │ Pulls image, starts container
└────────┬─────────────┘
         │ 7. Readiness probe passes
         ↓
┌──────────────────────┐
│ Endpoints Controller │ Adds pod IP to Service endpoints
└────────┬─────────────┘
         │ 8. kube-proxy updates iptables
         ↓
┌──────────────────┐
│ Backend Service  │ Now load-balances across 3 pods
│ 3 endpoints      │
└──────────────────┘
```

---

## Network Architecture

### Pod Network (CNI)

```
┌────────────────────────────────────────────────────────┐
│                  Minikube Node                         │
│  IP: 192.168.49.2 (example)                           │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Pod Network (10.244.0.0/16)                     │ │
│  │                                                   │ │
│  │  ┌────────────────┐  ┌────────────────┐         │ │
│  │  │ Frontend Pod 1 │  │ Backend Pod 1  │         │ │
│  │  │ 10.244.0.10    │  │ 10.244.0.20    │         │ │
│  │  │ eth0           │  │ eth0           │         │ │
│  │  └────────┬───────┘  └────────┬───────┘         │ │
│  │           │                   │                  │ │
│  │  ┌────────────────┐  ┌────────────────┐         │ │
│  │  │ Frontend Pod 2 │  │ Backend Pod 2  │         │ │
│  │  │ 10.244.0.11    │  │ 10.244.0.21    │         │ │
│  │  └────────┬───────┘  └────────┬───────┘         │ │
│  │           │                   │                  │ │
│  │           └─────────┬─────────┘                  │ │
│  │                     │                            │ │
│  │                 ┌───▼────┐                       │ │
│  │                 │ cni0   │ (Bridge)              │ │
│  │                 │ bridge │                       │ │
│  │                 └───┬────┘                       │ │
│  └─────────────────────┼──────────────────────────┘ │
│                        │                             │
│                    ┌───▼────┐                        │
│                    │ eth0   │ (Node interface)       │
│                    └────────┘                        │
└────────────────────────────────────────────────────────┘
```

### Service Network

```
Service IPs (ClusterIP range: 10.96.0.0/12)

┌─────────────────────────────────────────────┐
│ crime-backend-svc: 10.96.10.20:8000        │
│   → Endpoints:                              │
│      - 10.244.0.20:8000 (Backend Pod 1)    │
│      - 10.244.0.21:8000 (Backend Pod 2)    │
│                                             │
│ crime-frontend-svc: 10.96.10.30:80         │
│   → NodePort: 30080                         │
│   → Endpoints:                              │
│      - 10.244.0.10:80 (Frontend Pod 1)     │
│      - 10.244.0.11:80 (Frontend Pod 2)     │
└─────────────────────────────────────────────┘
```

### DNS Resolution

```
┌─────────────────────────────────────────────────────┐
│ CoreDNS (kube-system namespace)                     │
│                                                     │
│ DNS Records:                                        │
│ ┌─────────────────────────────────────────────┐   │
│ │ crime-backend-svc.default.svc.cluster.local │   │
│ │   → A record: 10.96.10.20                   │   │
│ │                                              │   │
│ │ crime-backend-svc (short name)               │   │
│ │   → CNAME to full name                       │   │
│ │                                              │   │
│ │ crime-frontend-svc.default.svc.cluster.local│   │
│ │   → A record: 10.96.10.30                   │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Pods query CoreDNS via:                            │
│ - /etc/resolv.conf → nameserver 10.96.0.10         │
└─────────────────────────────────────────────────────┘

Example resolution from frontend pod:
1. App calls: http://crime-backend-svc:8000/api/summary
2. DNS query: crime-backend-svc
3. CoreDNS responds: 10.96.10.20
4. Request sent to: 10.96.10.20:8000
5. kube-proxy intercepts (iptables rules)
6. Load-balanced to: 10.244.0.20:8000 or 10.244.0.21:8000
```

### kube-proxy (iptables mode)

```bash
# Example iptables rules created by kube-proxy

# Rule 1: Traffic to service IP
iptables -A KUBE-SERVICES \
  -d 10.96.10.20/32 -p tcp --dport 8000 \
  -j KUBE-SVC-BACKEND

# Rule 2: Load balance to endpoints (50/50 split)
iptables -A KUBE-SVC-BACKEND \
  -m statistic --mode random --probability 0.5 \
  -j KUBE-SEP-BACKEND-1

iptables -A KUBE-SVC-BACKEND \
  -j KUBE-SEP-BACKEND-2

# Rule 3: DNAT to pod IPs
iptables -A KUBE-SEP-BACKEND-1 \
  -p tcp -j DNAT --to-destination 10.244.0.20:8000

iptables -A KUBE-SEP-BACKEND-2 \
  -p tcp -j DNAT --to-destination 10.244.0.21:8000
```

---

## Scaling Strategy

### Horizontal Scaling (Pods)

**Backend (Dynamic):**
```
Min: 2 replicas (always)
Max: 6 replicas (under load)
Trigger: CPU > 60%
Scale-up: Immediate
Scale-down: After 5 minutes

Load Patterns:
┌────────────────────────────────────────┐
│ Normal:    2 pods @ 20-40% CPU        │
│ Medium:    3 pods @ 50-60% CPU        │
│ High:      4-6 pods @ 60-70% CPU      │
│ Recovery:  Scale back to 2 after load │
└────────────────────────────────────────┘
```

**Frontend (Static):**
```
Fixed: 2 replicas
Reason: Static content, low CPU usage
Future: Could add HPA for very high traffic
```

### Vertical Scaling (Resources)

**Current Limits:**
```yaml
Backend:
  Requests: 100m CPU, 128Mi RAM
  Limits: 500m CPU, 512Mi RAM
  Ratio: 5x CPU, 4x RAM

Frontend:
  Requests: 50m CPU, 64Mi RAM
  Limits: 200m CPU, 128Mi RAM
  Ratio: 4x CPU, 2x RAM
```

**Optimization Process:**
```
1. Deploy with generous limits
2. Monitor actual usage (kubectl top pods)
3. Observe patterns over days/weeks
4. Set requests = 90th percentile usage
5. Set limits = 2-3x requests
6. Leave headroom for spikes
```

### Resource Budgeting

```
Minimum Deployment (2+2 pods):
  CPU:    300m (2×100m + 2×50m)
  Memory: 384Mi (2×128Mi + 2×64Mi)

Maximum Deployment (6+2 pods):
  CPU:    700m (6×100m + 2×50m)
  Memory: 896Mi (6×128Mi + 2×64Mi)

Node Requirements:
  Minikube: 2 CPUs, 4GB RAM (sufficient)
  Production: 4+ CPUs, 8GB+ RAM per node
```

---

## Design Decisions

### Why Microservices?

**Decision**: Separate frontend and backend services

**Rationale:**
1. **Independent Scaling**: Backend scales based on CPU, frontend doesn't need to
2. **Technology Flexibility**: Can rewrite frontend without touching backend
3. **Team Structure**: Frontend and backend developers work independently
4. **Deployment Independence**: Update backend without redeploying frontend
5. **Failure Isolation**: Frontend crash doesn't affect backend

**Trade-offs:**
- ✅ Better scalability and maintainability
- ❌ More complex than monolith
- ❌ Network latency between services
- ❌ Harder to debug distributed issues

---

### Why FastAPI?

**Decision**: Use FastAPI instead of Flask/Django

**Rationale:**
1. **Performance**: Async support, comparable to Node.js/Go
2. **Type Safety**: Pydantic validation catches bugs early
3. **Auto Documentation**: Swagger UI generated automatically
4. **Modern Python**: Uses Python 3.11 features
5. **Learning Curve**: Easy for Python developers

**Comparison:**
```python
# Flask: Manual validation
@app.route('/api/points')
def points():
    delito = request.args.get('delito')
    limit = int(request.args.get('limit', 2000))
    if limit > 5000:
        return {"error": "Limit too high"}, 400
    # ...

# FastAPI: Automatic validation
@app.get('/api/points')
def points(delito: Optional[str] = Query(None), 
           limit: int = Query(2000, le=5000)):
    # Validation happens automatically
    # Invalid input returns 422 with details
    # ...
```

---

### Why ConfigMap for Data?

**Decision**: Store crime data in ConfigMap (demo only)

**Rationale:**
1. **Simplicity**: No database setup required
2. **Educational**: Demonstrates Kubernetes ConfigMap concept
3. **Immutable**: Historical crime data doesn't change
4. **Fast**: In-memory access, no network calls

**Limitations:**
1. **Size**: ConfigMaps limited to 1MB (need aggregation)
2. **No Queries**: Can't do SQL-style filtering efficiently
3. **No Updates**: Can't add new records without redeploying
4. **No Persistence**: Data lost if ConfigMap deleted

**Production Alternative:**
```yaml
# PostgreSQL with PostGIS
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 10Gi

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  template:
    spec:
      containers:
      - name: postgres
        image: postgis/postgis:15-3.3
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
```

---

### Why Minikube?

**Decision**: Use Minikube for local development

**Rationale:**
1. **Free**: No cloud costs during development
2. **Fast**: Local cluster, no network latency
3. **Complete**: Full Kubernetes API, not simplified
4. **Addons**: Built-in metrics-server, ingress, dashboard
5. **Reproducible**: Works on Windows/Mac/Linux

**Production Migration Path:**
```bash
# Same YAML works on production clusters
# Just change image registry and service types

# Development (Minikube)
image: crime-backend:latest
imagePullPolicy: Never
type: NodePort

# Production (AWS EKS)
image: 123456789.dkr.ecr.us-east-1.amazonaws.com/crime-backend:v1.2.3
imagePullPolicy: Always
type: LoadBalancer
```

---

## Security Architecture

### Defense in Depth

```
┌────────────────────────────────────────────────────┐
│ Layer 1: Network (Future - NetworkPolicy)         │
│ - Frontend can only talk to Backend                │
│ - Backend can only talk to Database                │
│ - No pod-to-pod communication otherwise            │
└────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────┐
│ Layer 2: Container                                 │
│ - Non-root user (UID 1001)                        │
│ - Read-only root filesystem (where possible)      │
│ - No privilege escalation                          │
│ - Dropped capabilities (no CAP_NET_RAW, etc.)     │
└────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────┐
│ Layer 3: Application                               │
│ - Input validation (FastAPI Query params)         │
│ - CORS configuration (restrict origins)            │
│ - Error handling (no stack traces to users)       │
│ - Rate limiting (future)                           │
└────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────┐
│ Layer 4: Data                                      │
│ - Secrets for sensitive data (not ConfigMap)      │
│ - Encryption at rest (production)                  │
│ - Encryption in transit (TLS)                      │
└────────────────────────────────────────────────────┘
```

### Current Security Posture

**✅ Implemented:**
- Non-root containers (UID 1001)
- Resource limits (prevent DoS)
- Health probes (detect compromised pods)
- ReadinessProbe removes unhealthy pods from traffic
- CORS middleware (configurable origins)

**⚠️ Demo-Only (Not Production-Safe):**
- No authentication/authorization
- CORS allows all origins (`*`)
- No TLS/HTTPS
- No network policies
- No secrets management
- No audit logging

**🔒 Production Requirements:**
```yaml
# Authentication
- JWT tokens or OAuth 2.0
- API keys with rate limiting
- mTLS between services

# Encryption
- TLS termination at Ingress
- Certificate management (cert-manager)
- Secrets encrypted at rest (KMS)

# Network
- NetworkPolicies (default deny)
- Service mesh (Istio/Linkerd)
- Web Application Firewall

# Monitoring
- Audit logs for all API calls
- Security scanning (Trivy, Falco)
- Intrusion detection
```

---

## Observability Architecture

### Metrics (Prometheus)

```
┌──────────────────────────────────────────────────┐
│ Metrics Collection Pipeline                      │
│                                                  │
│  ┌─────────────┐  ┌─────────────┐              │
│  │ Backend Pod │  │Frontend Pod │              │
│  │ :8000/metric│  │ (no metrics)│              │
│  └──────┬──────┘  └─────────────┘              │
│         │                                        │
│         │ Scrape every 15s                       │
│         ↓                                        │
│  ┌──────────────────┐                           │
│  │ Prometheus       │                           │
│  │ - Time series DB │                           │
│  │ - PromQL queries │                           │
│  │ - Alert rules    │                           │
│  └────────┬─────────┘                           │
│           │                                      │
│           │ Visualize                            │
│           ↓                                      │
│  ┌──────────────────┐                           │
│  │ Grafana          │                           │
│  │ - Dashboards     │                           │
│  │ - Annotations    │                           │
│  └──────────────────┘                           │
└──────────────────────────────────────────────────┘
```

### Logging (EFK Stack)

```
┌──────────────────────────────────────────────────┐
│ Logging Pipeline                                 │
│                                                  │
│  ┌─────────────┐  ┌─────────────┐              │
│  │ Backend Pod │  │Frontend Pod │              │
│  │ stdout/stderr│  │ stdout/stderr│             │
│  └──────┬──────┘  └──────┬──────┘              │
│         │                 │                      │
│         │    ┌────────────┘                      │
│         │    │                                   │
│         ↓    ↓                                   │
│  ┌──────────────────┐                           │
│  │ Fluentd          │                           │
│  │ (DaemonSet)      │                           │
│  │ - Parse logs     │                           │
│  │ - Add metadata   │                           │
│  └────────┬─────────┘                           │
│           │                                      │
│           │ Ship logs                            │
│           ↓                                      │
│  ┌──────────────────┐                           │
│  │ Elasticsearch    │                           │
│  │ - Index logs     │                           │
│  │ - Full-text search                           │
│  └────────┬─────────┘                           │
│           │                                      │
│           │ Query/Visualize                      │
│           ↓                                      │
│  ┌──────────────────┐                           │
│  │ Kibana           │                           │
│  │ - Log search     │                           │
│  │ - Aggregations   │                           │
│  └──────────────────┘                           │
└──────────────────────────────────────────────────┘
```

---

## Future Enhancements

### Phase 1: Production Hardening
- [ ] Add PostgreSQL with PostGIS
- [ ] Implement authentication (JWT)
- [ ] Enable TLS (cert-manager)
- [ ] Deploy to cloud (EKS/GKE)
- [ ] Add monitoring (Prometheus + Grafana)

### Phase 2: Advanced Features
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] GitOps (ArgoCD)
- [ ] Service mesh (Istio)
- [ ] Distributed tracing (Jaeger)
- [ ] Canary deployments

### Phase 3: Scale & Resilience
- [ ] Multi-region deployment
- [ ] Database replication
- [ ] CDN for static assets
- [ ] Chaos engineering (Chaos Mesh)
- [ ] Disaster recovery procedures

---

## Conclusion

This architecture demonstrates **production-ready patterns** in a **learning-friendly format**. While simplified for demonstration, the same principles scale to enterprise applications serving millions of users.

**Key Takeaways:**
1. Microservices enable independent scaling and deployment
2. Kubernetes provides declarative infrastructure management
3. Horizontal scaling adapts to variable load automatically
4. Security should be implemented at multiple layers
5. Observability is critical for production operations

For questions or contributions, see the main [README.md](../README.md).