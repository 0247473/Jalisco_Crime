# 🚀 Production Deployment Guide

Comprehensive guide for deploying the Jalisco Crime Dashboard to production Kubernetes clusters.

## Table of Contents

- [Production Readiness Checklist](#production-readiness-checklist)
- [Infrastructure Setup](#infrastructure-setup)
- [Security Hardening](#security-hardening)
- [Database Migration](#database-migration)
- [Container Registry](#container-registry)
- [Kubernetes Configuration](#kubernetes-configuration)
- [Monitoring & Observability](#monitoring--observability)
- [CI/CD Pipeline](#cicd-pipeline)
- [High Availability](#high-availability)
- [Disaster Recovery](#disaster-recovery)
- [Performance Optimization](#performance-optimization)
- [Cost Optimization](#cost-optimization)

---

## Production Readiness Checklist

### Critical Requirements

Before deploying to production, ensure these are complete:

- [ ] **Infrastructure**
  - [ ] Managed Kubernetes cluster (EKS/GKE/AKS) provisioned
  - [ ] Multi-zone deployment configured
  - [ ] Load balancer provisioned
  - [ ] DNS configured
  - [ ] SSL/TLS certificates obtained

- [ ] **Security**
  - [ ] HTTPS enabled (TLS termination)
  - [ ] Authentication implemented (JWT/OAuth)
  - [ ] RBAC configured
  - [ ] Network policies applied
  - [ ] Secrets management configured
  - [ ] Security scanning enabled
  - [ ] Container images scanned for vulnerabilities

- [ ] **Data**
  - [ ] Production database deployed (PostgreSQL)
  - [ ] Database backups configured
  - [ ] Data migration completed
  - [ ] Data encryption at rest enabled
  - [ ] Connection pooling configured

- [ ] **Monitoring**
  - [ ] Prometheus deployed
  - [ ] Grafana dashboards configured
  - [ ] Alerting rules defined
  - [ ] Log aggregation setup (EFK/ELK)
  - [ ] Distributed tracing configured
  - [ ] Uptime monitoring setup

- [ ] **Reliability**
  - [ ] Resource limits properly set
  - [ ] HPA configured and tested
  - [ ] PodDisruptionBudgets defined
  - [ ] Readiness/Liveness probes configured
  - [ ] Multiple replicas running
  - [ ] Disaster recovery plan documented

- [ ] **CI/CD**
  - [ ] Automated build pipeline
  - [ ] Automated testing
  - [ ] Container scanning in pipeline
  - [ ] GitOps deployment configured
  - [ ] Rollback procedures tested

---

## Infrastructure Setup

### Cloud Provider Selection

**Recommended Managed Kubernetes Services:**

| Provider | Service | Best For | Starting Cost |
|----------|---------|----------|---------------|
| **AWS** | EKS (Elastic Kubernetes Service) | Enterprise, AWS ecosystem | ~$75/month |
| **Google Cloud** | GKE (Google Kubernetes Engine) | Kubernetes-native, auto-upgrade | ~$70/month |
| **Azure** | AKS (Azure Kubernetes Service) | Microsoft ecosystem, Windows workloads | ~$70/month |
| **DigitalOcean** | DOKS (DigitalOcean Kubernetes) | Simplicity, startups | ~$40/month |
| **Linode** | LKE (Linode Kubernetes Engine) | Cost-effective, simple | ~$30/month |

### AWS EKS Setup

```bash
# Install eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# Create EKS cluster
eksctl create cluster \
  --name crime-dashboard-prod \
  --region us-east-1 \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 10 \
  --managed \
  --with-oidc \
  --ssh-access \
  --ssh-public-key my-key \
  --full-ecr-access

# Configure kubectl
aws eks update-kubeconfig --region us-east-1 --name crime-dashboard-prod

# Verify
kubectl get nodes
```

### Google GKE Setup

```bash
# Install gcloud CLI
# https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login

# Create GKE cluster
gcloud container clusters create crime-dashboard-prod \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type n1-standard-2 \
  --enable-autoscaling \
  --min-nodes 3 \
  --max-nodes 10 \
  --enable-autorepair \
  --enable-autoupgrade \
  --enable-stackdriver-kubernetes

# Configure kubectl
gcloud container clusters get-credentials crime-dashboard-prod --zone us-central1-a

# Verify
kubectl get nodes
```

### Azure AKS Setup

```bash
# Install Azure CLI
# https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

# Login
az login

# Create resource group
az group create --name crime-dashboard-rg --location eastus

# Create AKS cluster
az aks create \
  --resource-group crime-dashboard-rg \
  --name crime-dashboard-prod \
  --node-count 3 \
  --node-vm-size Standard_D2s_v3 \
  --enable-cluster-autoscaler \
  --min-count 3 \
  --max-count 10 \
  --generate-ssh-keys

# Configure kubectl
az aks get-credentials --resource-group crime-dashboard-rg --name crime-dashboard-prod

# Verify
kubectl get nodes
```

---

## Security Hardening

### 1. TLS/HTTPS Configuration

#### Install cert-manager

```bash
# Add Jetstack Helm repository
helm repo add jetstack https://charts.jetstack.io
helm repo update

# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.12.0/cert-manager.yaml

# Verify installation
kubectl get pods -n cert-manager
```

#### Configure Let's Encrypt Issuer

```yaml
# cert-manager/issuer-prod.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```

```bash
kubectl apply -f cert-manager/issuer-prod.yaml
```

#### Update Ingress with TLS

```yaml
# k8s/ingress-prod.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: crime-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - crime.yourdomain.com
    secretName: crime-tls-secret
  rules:
  - host: crime.yourdomain.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: crime-backend-svc
            port:
              number: 8000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: crime-frontend-svc
            port:
              number: 80
```

### 2. Authentication & Authorization

#### Implement JWT Authentication

**Backend changes:**

```python
# backend/auth.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from datetime import datetime, timedelta

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

security = HTTPBearer()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Update main.py
from auth import verify_token

@app.get("/api/summary", dependencies=[Depends(verify_token)])
def summary():
    # Endpoint now requires valid JWT token
    return {...}
```

**Add to requirements.txt:**
```txt
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6
```

#### Create Kubernetes Secret for JWT

```bash
# Generate secret key
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Create Kubernetes Secret
kubectl create secret generic jwt-secret \
  --from-literal=secret-key='your-generated-secret-key'

# Update deployment to use secret
kubectl edit deployment crime-backend
```

```yaml
# Add to backend deployment
env:
- name: JWT_SECRET_KEY
  valueFrom:
    secretKeyRef:
      name: jwt-secret
      key: secret-key
```

### 3. RBAC Configuration

```yaml
# k8s/rbac.yaml
---
# ServiceAccount for backend
apiVersion: v1
kind: ServiceAccount
metadata:
  name: crime-backend-sa
  namespace: default

---
# Role with minimal permissions
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: crime-backend-role
  namespace: default
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]

---
# RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: crime-backend-rolebinding
  namespace: default
subjects:
- kind: ServiceAccount
  name: crime-backend-sa
  namespace: default
roleRef:
  kind: Role
  name: crime-backend-role
  apiGroup: rbac.authorization.k8s.io
```

Update deployment to use ServiceAccount:

```yaml
# In backend-deployment.yaml
spec:
  template:
    spec:
      serviceAccountName: crime-backend-sa
      # ... rest of spec
```

### 4. Network Policies

```yaml
# k8s/network-policy-prod.yaml
---
# Default deny all traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: default
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress

---
# Allow frontend to backend
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-allow-from-frontend
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: crime-backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: crime-frontend
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx  # Allow from ingress
    ports:
    - protocol: TCP
      port: 8000

---
# Allow backend egress to database
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-allow-to-db
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: crime-backend
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:  # Allow DNS
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: UDP
      port: 53

---
# Allow frontend ingress from ingress controller
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-allow-from-ingress
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: crime-frontend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 80
```

### 5. Pod Security Standards

```yaml
# k8s/pod-security.yaml
---
# Enforce restricted Pod Security Standards
apiVersion: v1
kind: Namespace
metadata:
  name: crime-dashboard
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

Update deployments with security contexts:

```yaml
# In backend-deployment.yaml
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault
      containers:
      - name: backend
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 1001
          capabilities:
            drop:
            - ALL
        # ... rest of container spec
```

---

## Database Migration

### Deploy PostgreSQL with PostGIS

```yaml
# k8s/postgres-prod.yaml
---
# PersistentVolumeClaim for database storage
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
  storageClassName: gp2  # AWS EBS, adjust for your provider

---
# Secret for database credentials
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
type: Opaque
stringData:
  POSTGRES_USER: crimeuser
  POSTGRES_PASSWORD: "changeme123"  # Use strong password
  POSTGRES_DB: crime_db

---
# PostgreSQL StatefulSet
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgis/postgis:15-3.3
        ports:
        - containerPort: 5432
          name: postgres
        env:
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: POSTGRES_USER
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: POSTGRES_PASSWORD
        - name: POSTGRES_DB
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: POSTGRES_DB
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1"
        livenessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - crimeuser
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - crimeuser
          initialDelaySeconds: 5
          periodSeconds: 10
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: gp2
      resources:
        requests:
          storage: 50Gi

---
# PostgreSQL Service
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
  clusterIP: None  # Headless service for StatefulSet
```

### Migrate Data to PostgreSQL

**Create migration script:**

```python
# scripts/migrate_to_postgres.py
import json
import psycopg2
from psycopg2.extras import execute_values

# Load JSON data
with open('data/crime_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Connect to PostgreSQL
conn = psycopg2.connect(
    host="localhost",  # Use port-forward: kubectl port-forward svc/postgres 5432:5432
    database="crime_db",
    user="crimeuser",
    password="changeme123"
)
cur = conn.cursor()

# Create table with PostGIS extension
cur.execute("""
    CREATE EXTENSION IF NOT EXISTS postgis;
    
    CREATE TABLE IF NOT EXISTS crimes (
        id SERIAL PRIMARY KEY,
        delito VARCHAR(255),
        municipio VARCHAR(255),
        fecha DATE,
        coordinates GEOGRAPHY(POINT, 4326),
        year INTEGER,
        INDEX idx_delito (delito),
        INDEX idx_municipio (municipio),
        INDEX idx_year (year),
        INDEX idx_coordinates USING GIST (coordinates)
    );
""")

# Insert crime records
records = [
    (
        point['delito'],
        point['municipio'],
        point.get('fecha'),
        f"POINT({point['lng']}{point['lat']})",  # Note: PostGIS uses lng,lat order
        point.get('year')
    )
    for point in data['sample']
]

execute_values(
    cur,
    "INSERT INTO crimes (delito, municipio, fecha, coordinates, year) VALUES %s",
    records,
    template="(%s, %s, %s, ST_GeogFromText(%s), %s)"
)

conn.commit()
cur.close()
conn.close()

print(f"Migrated {len(records)} records to PostgreSQL")
```

**Run migration:**

```bash
# Port-forward to PostgreSQL
kubectl port-forward svc/postgres 5432:5432

# Install dependencies
pip install psycopg2-binary

# Run migration
python scripts/migrate_to_postgres.py
```

### Update Backend to Use PostgreSQL

```python
# backend/database.py
from sqlalchemy import create_engine, Column, Integer, String, Date
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from geoalchemy2 import Geography
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://crimeuser:changeme123@postgres:5432/crime_db"
)

engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Crime(Base):
    __tablename__ = "crimes"
    
    id = Column(Integer, primary_key=True, index=True)
    delito = Column(String, index=True)
    municipio = Column(String, index=True)
    fecha = Column(Date)
    coordinates = Column(Geography(geometry_type='POINT', srid=4326))
    year = Column(Integer, index=True)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

```python
# backend/main.py - Updated
from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from geoalchemy2.functions import ST_AsText
from database import get_db, Crime
import json

app = FastAPI()

@app.get("/api/points")
def points(
    delito: Optional[str] = None,
    municipio: Optional[str] = None,
    limit: int = Query(2000, le=5000),
    db: Session = Depends(get_db)
):
    query = db.query(
        Crime.id,
        Crime.delito,
        Crime.municipio,
        Crime.fecha,
        ST_AsText(Crime.coordinates).label('coords')
    )
    
    if delito:
        query = query.filter(Crime.delito == delito)
    if municipio:
        query = query.filter(Crime.municipio == municipio)
    
    results = query.limit(limit).all()
    
    points = []
    for r in results:
        # Parse "POINT(lng lat)" to get coordinates
        coords = r.coords.replace('POINT(', '').replace(')', '').split()
        points.append({
            "id": r.id,
            "delito": r.delito,
            "municipio": r.municipio,
            "fecha": r.fecha.isoformat() if r.fecha else None,
            "lng": float(coords[0]),
            "lat": float(coords[1])
        })
    
    return {"points": points, "total": len(points)}
```

**Update requirements.txt:**
```txt
sqlalchemy==2.0.19
psycopg2-binary==2.9.6
geoalchemy2==0.14.0
```

**Update deployment with database connection:**
```yaml
# In backend-deployment.yaml
env:
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: postgres-secret
      key: DATABASE_URL
```

---

## Container Registry

### Push Images to Cloud Registry

#### AWS ECR

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# Create repositories
aws ecr create-repository --repository-name crime-backend
aws ecr create-repository --repository-name crime-frontend

# Tag images
docker tag crime-backend:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/crime-backend:v1.0.0
docker tag crime-frontend:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/crime-frontend:v1.0.0

# Push images
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/crime-backend:v1.0.0
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/crime-frontend:v1.0.0
```

#### Google GCR

```bash
# Authenticate Docker to GCR
gcloud auth configure-docker

# Tag images
docker tag crime-backend:latest gcr.io/my-project-id/crime-backend:v1.0.0
docker tag crime-frontend:latest gcr.io/my-project-id/crime-frontend:v1.0.0

# Push images
docker push gcr.io/my-project-id/crime-backend:v1.0.0
docker push gcr.io/my-project-id/crime-frontend:v1.0.0
```

#### Azure ACR

```bash
# Create ACR
az acr create --resource-group crime-dashboard-rg --name crimedashboardacr --sku Basic

# Login to ACR
az acr login --name crimedashboardacr

# Tag images
docker tag crime-backend:latest crimedashboardacr.azurecr.io/crime-backend:v1.0.0
docker tag crime-frontend:latest crimedashboardacr.azurecr.io/crime-frontend:v1.0.0

# Push images
docker push crimedashboardacr.azurecr.io/crime-backend:v1.0.0
docker push crimedashboardacr.azurecr.io/crime-frontend:v1.0.0
```

### Update Deployments to Use Registry

```yaml
# k8s/backend-deployment-prod.yaml
spec:
  template:
    spec:
      containers:
      - name: backend
        image: 123456789.dkr.ecr.us-east-1.amazonaws.com/crime-backend:v1.0.0
        imagePullPolicy: Always  # Changed from Never
```

---

## Kubernetes Configuration

### Production Deployment Manifests

```yaml
# k8s/backend-deployment-prod.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: crime-backend
  labels:
    app: crime-backend
    version: v1.0.0
    environment: production
spec:
  replicas: 3  # Increased from 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: crime-backend
  template:
    metadata:
      labels:
        app: crime-backend
        version: v1.0.0
    spec:
      serviceAccountName: crime-backend-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - crime-backend
              topologyKey: kubernetes.io/hostname
      containers:
      - name: backend
        image: 123456789.dkr.ecr.us-east-1.amazonaws.com/crime-backend:v1.0.0
        imagePullPolicy: Always
        ports:
        - name: http
          containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: DATABASE_URL
        - name: JWT_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret-key
        - name: LOG_LEVEL
          value: "INFO"
        - name: WORKERS
          value: "4"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 20
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: false
          runAsNonRoot: true
          runAsUser: 1001
          capabilities:
            drop:
            - ALL

---
apiVersion: v1
kind: Service
metadata:
  name: crime-backend-svc
  labels:
    app: crime-backend
spec:
  type: ClusterIP
  selector:
    app: crime-backend
  ports:
  - name: http
    port: 8000
    targetPort: 8000
  sessionAffinity: None

---
# PodDisruptionBudget
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: crime-backend-pdb
spec:
  minAvailable: 2  # Always keep at least 2 pods running
  selector:
    matchLabels:
      app: crime-backend
```

### HPA Configuration for Production

```yaml
# k8s/hpa-prod.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: crime-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: crime-backend
  minReplicas: 3
  maxReplicas: 20  # Increased for production traffic
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
      - type: Pods
        value: 2
        periodSeconds: 60
      selectPolicy: Min
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 4
        periodSeconds: 15
      selectPolicy: Max
```

---

## Monitoring & Observability

### Deploy Prometheus Stack

```bash
# Add Prometheus Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Create monitoring namespace
kubectl create namespace monitoring

# Install kube-prometheus-stack (includes Prometheus, Grafana, AlertManager)
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi \
  --set grafana.adminPassword=admin123 \
  --set grafana.persistence.enabled=true \
  --set grafana.persistence.size=10Gi

# Verify installation
kubectl get pods -n monitoring
```

### Access Grafana

```bash
# Port-forward Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Access: http://localhost:3000
# Login: admin / admin123
```

### Custom Grafana Dashboard

Import dashboard ID `15661` (Kubernetes cluster monitoring) or create custom:

```json
{
  "dashboard": {
    "title": "Crime Dashboard Metrics",
    "panels": [
      {
        "title": "Backend Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total{app=\"crime-backend\"}[5m])"
          }
        ]
      },
      {
        "title": "Backend Response Time (p95)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{app=\"crime-backend\"}[5m]))"
          }
        ]
      },
      {
        "title": "Backend Pod Count",
        "targets": [
          {
            "expr": "count(kube_pod_info{pod=~\"crime-backend.*\"})"
          }
        ]
      }
    ]
  }
}
```

### Configure Alerts

```yaml
# k8s/prometheus-alerts.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-alerts
  namespace: monitoring
data:
  alerts.yml: |
    groups:
    - name: crime-dashboard
      interval: 30s
      rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"
      
      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total{pod=~"crime-.*"}[15m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.pod }} is crash looping"
      
      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes{pod=~"crime-.*"} / container_spec_memory_limit_bytes{pod=~"crime-.*"} > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.pod }} using >90% memory"
      
      - alert: HPAMaxedOut
        expr: kube_horizontalpodautoscaler_status_current_replicas{horizontalpodautoscaler="crime-backend-hpa"} == kube_horizontalpodautoscaler_spec_max_replicas{horizontalpodautoscaler="crime-backend-hpa"}
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "HPA has reached max replicas"
          description: "Consider increasing max replicas"
```

### Deploy EFK Stack for Logging

```bash
# Deploy Elasticsearch
kubectl apply -f https://download.elastic.co/downloads/eck/2.8.0/crds.yaml
kubectl apply -f https://download.elastic.co/downloads/eck/2.8.0/operator.yaml

# Create Elasticsearch cluster
cat <<EOF | kubectl apply -f -
apiVersion: elasticsearch.k8s.elastic.co/v1
kind: Elasticsearch
metadata:
  name: crime-logs
  namespace: logging
spec:
  version: 8.8.0
  nodeSets:
  - name: default
    count: 3
    config:
      node.store.allow_mmap: false
    volumeClaimTemplates:
    - metadata:
        name: elasticsearch-data
      spec:
        accessModes:
        - ReadWriteOnce
        resources:
          requests:
            storage: 100Gi
        storageClassName: gp2
EOF

# Deploy Kibana
cat <<EOF | kubectl apply -f -
apiVersion: kibana.k8s.elastic.co/v1
kind: Kibana
metadata:
  name: crime-logs
  namespace: logging
spec:
  version: 8.8.0
  count: 1
  elasticsearchRef:
    name: crime-logs
EOF

# Deploy Fluentd
helm repo add fluent https://fluent.github.io/helm-charts
helm install fluentd fluent/fluentd \
  --namespace logging \
  --set elasticsearch.host=crime-logs-es-http.logging.svc \
  --set elasticsearch.port=9200
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY_BACKEND: crime-backend
  ECR_REPOSITORY_FRONTEND: crime-frontend
  EKS_CLUSTER_NAME: crime-dashboard-prod

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    
    - name: Install dependencies
      run: |
        cd backend
        pip install -r requirements.txt
        pip install pytest pytest-cov
    
    - name: Run tests
      run: |
        cd backend
        pytest tests/ --cov=. --cov-report=xml
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3

  security-scan:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        scan-ref: '.'
        format: 'sarif'
        output: 'trivy-results.sarif'
    
    - name: Upload Trivy results to GitHub Security
      uses: github/codeql-action/upload-sarif@v2
      with:
        sarif_file: 'trivy-results.sarif'

  build-and-push:
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}
    
    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v1
    
    - name: Build, tag, and push backend image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY_BACKEND:$IMAGE_TAG ./backend
        docker tag $ECR_REGISTRY/$ECR_REPOSITORY_BACKEND:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY_BACKEND:latest
        docker push $ECR_REGISTRY/$ECR_REPOSITORY_BACKEND:$IMAGE_TAG
        docker push $ECR_REGISTRY/$ECR_REPOSITORY_BACKEND:latest
    
    - name: Build, tag, and push frontend image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY_FRONTEND:$IMAGE_TAG ./frontend
        docker tag $ECR_REGISTRY/$ECR_REPOSITORY_FRONTEND:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY_FRONTEND:latest
        docker push $ECR_REGISTRY/$ECR_REPOSITORY_FRONTEND:$IMAGE_TAG
        docker push $ECR_REGISTRY/$ECR_REPOSITORY_FRONTEND:latest
    
    - name: Update kube config
      run: aws eks update-kubeconfig --name $EKS_CLUSTER_NAME --region $AWS_REGION
    
    - name: Deploy to EKS
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        IMAGE_TAG: ${{ github.sha }}
      run: |
        kubectl set image deployment/crime-backend backend=$ECR_REGISTRY/$ECR_REPOSITORY_BACKEND:$IMAGE_TAG
        kubectl set image deployment/crime-frontend frontend=$ECR_REGISTRY/$ECR_REPOSITORY_FRONTEND:$IMAGE_TAG
        kubectl rollout status deployment/crime-backend
        kubectl rollout status deployment/crime-frontend
    
    - name: Verify deployment
      run: |
        kubectl get pods
        kubectl get svc
```

### ArgoCD GitOps Setup

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Access ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Login: admin / <password>
```

**Create ArgoCD Application:**

```yaml
# argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: crime-dashboard
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/yourusername/jalisco-crime-k8s.git
    targetRevision: HEAD
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true
```

---

## High Availability

### Multi-Zone Deployment

```yaml
# k8s/backend-deployment-ha.yaml
spec:
  template:
    spec:
      affinity:
        # Spread pods across availability zones
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values:
                - crime-backend
            topologyKey: topology.kubernetes.io/zone
        # Prefer different nodes
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - crime-backend
              topologyKey: kubernetes.io/hostname
```

### Database High Availability

```bash
# Use managed database services for HA:
# - AWS RDS with Multi-AZ
# - Google Cloud SQL with HA configuration
# - Azure Database for PostgreSQL with zone redundancy

# Example: AWS RDS
aws rds create-db-instance \
  --db-instance-identifier crime-db-prod \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 15.3 \
  --master-username crimeuser \
  --master-user-password "SecurePassword123!" \
  --allocated-storage 100 \
  --storage-type gp3 \
  --multi-az \
  --backup-retention-period 7 \
  --publicly-accessible false \
  --vpc-security-group-ids sg-12345678 \
  --db-subnet-group-name crime-db-subnet
```

---

## Disaster Recovery

### Backup Strategy

```bash
# Install Velero for cluster backups
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.7.0 \
  --bucket crime-dashboard-backups \
  --backup-location-config region=us-east-1 \
  --snapshot-location-config region=us-east-1 \
  --secret-file ./credentials-velero

# Create backup schedule
velero schedule create daily-backup \
  --schedule="0 2 * * *" \
  --include-namespaces default,monitoring \
  --ttl 720h0m0s

# Manual backup
velero backup create manual-backup-$(date +%Y%m%d)
```

### Database Backup

```bash
# Automated RDS backups (AWS)
# Already configured with --backup-retention-period 7

# Manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier crime-db-prod \
  --db-snapshot-identifier crime-db-snapshot-$(date +%Y%m%d)

# Export to S3 for long-term storage
aws rds start-export-task \
  --export-task-identifier export-$(date +%Y%m%d) \
  --source-arn arn:aws:rds:us-east-1:123456789:snapshot:crime-db-snapshot-$(date +%Y%m%d) \
  --s3-bucket-name crime-db-exports \
  --iam-role-arn arn:aws:iam::123456789:role/rds-export-role \
  --kms-key-id arn:aws:kms:us-east-1:123456789:key/abcd1234
```

### Disaster Recovery Plan

**RTO (Recovery Time Objective): 1 hour**
**RPO (Recovery Point Objective): 15 minutes**

**Recovery Steps:**

1. **Assess Damage**
   ```bash
   kubectl get nodes
   kubectl get pods -A
   kubectl get events --sort-by='.lastTimestamp' | tail -50
   ```

2. **Restore from Backup**
   ```bash
   # Restore Kubernetes resources
   velero restore create --from-backup daily-backup-20260519
   
   # Monitor restore
   velero restore describe <restore-name>
   ```

3. **Restore Database**
   ```bash
   # Restore RDS from snapshot
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier crime-db-prod-restored \
     --db-snapshot-identifier crime-db-snapshot-20260519
   
   # Update backend to point to restored DB
   kubectl set env deployment/crime-backend \
     DATABASE_URL="postgresql://user:pass@crime-db-prod-restored.xyz.us-east-1.rds.amazonaws.com:5432/crime_db"
   ```

4. **Verify Recovery**
   ```bash
   # Check all pods running
   kubectl get pods
   
   # Test application
   curl https://crime.yourdomain.com/api/health
   ```

---

## Performance Optimization

### Backend Optimization

```python
# backend/main.py - Add caching
from functools import lru_cache
from cachetools import TTLCache
import asyncio

# In-memory cache with TTL
summary_cache = TTLCache(maxsize=100, ttl=300)  # 5 minutes

@app.get("/api/summary")
async def summary(db: Session = Depends(get_db)):
    cache_key = "summary"
    
    if cache_key in summary_cache:
        return summary_cache[cache_key]
    
    # Fetch from database
    result = await asyncio.to_thread(fetch_summary, db)
    
    summary_cache[cache_key] = result
    return result

def fetch_summary(db: Session):
    # Expensive database query
    total = db.query(Crime).count()
    by_year = db.query(Crime.year, func.count(Crime.id)).group_by(Crime.year).all()
    # ...
    return {...}
```

### Database Optimization

```sql
-- Add indexes
CREATE INDEX idx_crimes_delito_municipio ON crimes(delito, municipio);
CREATE INDEX idx_crimes_fecha ON crimes(fecha);
CREATE INDEX idx_crimes_coords ON crimes USING GIST(coordinates);

-- Analyze query performance
EXPLAIN ANALYZE
SELECT delito, municipio, ST_AsText(coordinates)
FROM crimes
WHERE delito = 'Robo'
LIMIT 2000;

-- Add materialized view for aggregations
CREATE MATERIALIZED VIEW crime_summary AS
SELECT 
  delito,
  COUNT(*) as count,
  MIN(fecha) as first_occurrence,
  MAX(fecha) as last_occurrence
FROM crimes
GROUP BY delito;

CREATE INDEX idx_crime_summary_delito ON crime_summary(delito);

-- Refresh materialized view daily
CREATE OR REPLACE FUNCTION refresh_crime_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY crime_summary;
END;
$$ LANGUAGE plpgsql;
```

### Frontend Optimization

```javascript
// app.js - Implement debouncing for filters
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Debounce filter application
const applyFiltersDebounced = debounce(async () => {
  const delito = document.getElementById('delitoFilter').value;
  const municipio = document.getElementById('municipioFilter').value;
  await loadMapPoints(delito, municipio);
}, 300);

// Use lazy loading for map markers
function renderMapPoints(points) {
  state.markers.clearLayers();
  
  // Only render visible points
  const bounds = state.map.getBounds();
  const visiblePoints = points.filter(p => bounds.contains([p.lat, p.lng]));
  
  visiblePoints.forEach(point => {
    const marker = L.circleMarker([point.lat, point.lng], {...});
    marker.addTo(state.markers);
  });
}
```

### CDN for Static Assets

```yaml
# Use CloudFront (AWS), Cloud CDN (GCP), or Azure CDN

# Example: AWS CloudFront distribution
aws cloudfront create-distribution \
  --origin-domain-name crime-frontend-lb-123456.us-east-1.elb.amazonaws.com \
  --default-root-object index.html \
  --price-class PriceClass_100

# Update frontend service to use CDN
# Replace direct LoadBalancer with CloudFront URL
```

---

## Cost Optimization

### Resource Right-Sizing

```bash
# Analyze actual resource usage
kubectl top pods --containers

# Adjust resource requests/limits based on actual usage
# Set requests = 90th percentile of actual usage
# Set limits = 2x requests

# Example adjustment
kubectl set resources deployment crime-backend \
  --requests=cpu=200m,memory=256Mi \
  --limits=cpu=800m,memory=768Mi
```

### Cluster Autoscaling

```bash
# Enable cluster autoscaler (EKS example)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml

# Configure autoscaler
kubectl -n kube-system \
  annotate deployment.apps/cluster-autoscaler \
  cluster-autoscaler.kubernetes.io/safe-to-evict="false"

kubectl -n kube-system \
  set image deployment.apps/cluster-autoscaler \
  cluster-autoscaler=k8s.gcr.io/autoscaling/cluster-autoscaler:v1.27.0
```

### Spot Instances (AWS)

```yaml
# Use spot instances for cost savings (50-90% cheaper)
# Create mixed instance node group
eksctl create nodegroup \
  --cluster=crime-dashboard-prod \
  --name=spot-workers \
  --node-type=m5.large,m5a.large,m5n.large \
  --nodes=2 \
  --nodes-min=2 \
  --nodes-max=10 \
  --spot
```

### Cost Monitoring

```bash
# Install kubecost for cost visibility
kubectl create namespace kubecost
helm install kubecost kubecost/cost-analyzer \
  --namespace kubecost \
  --set kubecostToken="your-token"

# Access Kubecost dashboard
kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090

# View cost breakdown by namespace, deployment, pod
```

---

## Production Checklist (Final)

Before going live:

### Pre-Launch (1 Week Before)

- [ ] Load testing completed (simulate expected traffic)
- [ ] Security audit completed
- [ ] Database indexed and optimized
- [ ] Backups tested and verified
- [ ] Monitoring dashboards configured
- [ ] Alerts configured and tested
- [ ] Documentation updated
- [ ] Runbooks created for common issues
- [ ] On-call rotation established
- [ ] Incident response plan documented

### Launch Day

- [ ] Deploy to production during low-traffic window
- [ ] Smoke tests pass
- [ ] Health checks passing
- [ ] Monitoring showing green
- [ ] No critical alerts
- [ ] DNS propagated
- [ ] SSL certificates valid
- [ ] CDN functioning
- [ ] Database connections healthy
- [ ] All pods running and ready

### Post-Launch (1 Week After)

- [ ] Monitor error rates (should be <0.1%)
- [ ] Monitor latency (p95 <500ms, p99 <1s)
- [ ] Monitor resource usage (CPU <70%, Memory <80%)
- [ ] Review logs for errors
- [ ] Collect user feedback
- [ ] Plan optimization based on metrics
- [ ] Document lessons learned

---

## Maintenance Windows

**Recommended Schedule:**
- **Weekly**: Minor updates, security patches (Tuesday 2-4 AM)
- **Monthly**: Major updates, feature releases (First Tuesday 2-6 AM)
- **Quarterly**: Database maintenance, major upgrades (Sunday 12-6 AM)

**Maintenance Procedure:**
1. Announce maintenance 48 hours in advance
2. Create backup immediately before maintenance
3. Enable maintenance mode page
4. Perform updates
5. Run smoke tests
6. Disable maintenance mode
7. Monitor for 2 hours
8. Document changes

---

## Conclusion

Production deployment requires careful planning and execution. This guide provides a comprehensive roadmap, but remember:

1. **Start Small**: Deploy to staging first, test thoroughly
2. **Automate Everything**: CI/CD, backups, monitoring, alerts
3. **Monitor Continuously**: You can't fix what you can't see
4. **Plan for Failure**: Disaster recovery, backups, rollback procedures
5. **Document Everything**: Runbooks, architecture, procedures
6. **Iterate**: Continuous improvement based on metrics and feedback

For questions or support, contact the maintainers or open a GitHub issue.

**Good luck with your production deployment!** 🚀