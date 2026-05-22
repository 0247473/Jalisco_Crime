# 🚀 Deployment Guide

Complete step-by-step guide for deploying the Jalisco Crime Dashboard on Kubernetes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (5 Minutes)](#quick-start-5-minutes)
- [Detailed Deployment Steps](#detailed-deployment-steps)
- [Deployment Verification](#deployment-verification)
- [Accessing the Dashboard](#accessing-the-dashboard)
- [Updating the Application](#updating-the-application)
- [Scaling Operations](#scaling-operations)
- [Backup and Restore](#backup-and-restore)
- [Cleanup](#cleanup)

---

## Prerequisites

### Required Software

| Software | Minimum Version | Installation Guide |
|----------|----------------|-------------------|
| **Docker Desktop** | 20.10+ | [Install Docker](https://docs.docker.com/get-docker/) |
| **Minikube** | 1.30+ | [Install Minikube](https://minikube.sigs.k8s.io/docs/start/) |
| **kubectl** | 1.28+ | [Install kubectl](https://kubernetes.io/docs/tasks/tools/) |
| **Git** | 2.30+ | [Install Git](https://git-scm.com/downloads) |

### System Requirements

**Development (Minikube):**
- CPU: 2+ cores
- RAM: 4GB+ available
- Disk: 20GB+ free space
- OS: Windows 10/11, macOS 10.14+, Linux (Ubuntu 20.04+)

**Production:**
- Managed Kubernetes cluster (EKS, GKE, AKS)
- 3+ worker nodes (4 CPU, 8GB RAM each)
- Load balancer support
- Container registry (ECR, GCR, ACR, Docker Hub)

### Knowledge Prerequisites

- Basic command-line skills
- Understanding of Docker containers
- Familiarity with Kubernetes concepts (optional but helpful)

---

## Quick Start (5 Minutes)

For experienced users who want to get running immediately:

```bash
# 1. Start Minikube
minikube start --memory=4096 --cpus=2

# 2. Enable addons
minikube addons enable metrics-server

# 3. Configure Docker
eval $(minikube docker-env)  # Linux/Mac
# OR
minikube docker-env | Invoke-Expression  # PowerShell

# 4. Clone repository
git clone https://github.com/yourusername/jalisco-crime-k8s.git
cd jalisco-crime-k8s

# 5. Build images
docker build -t crime-backend:latest ./backend
docker build -t crime-frontend:latest ./frontend

# 6. Create ConfigMap (assuming you have crime_data.json)
kubectl create configmap crime-data --from-file=crime_data.json=./data/crime_data.json

# 7. Deploy
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/hpa.yaml

# 8. Wait for ready
kubectl wait --for=condition=ready pod -l app=crime-backend --timeout=120s
kubectl wait --for=condition=ready pod -l app=crime-frontend --timeout=120s

# 9. Access
minikube service crime-frontend-svc --url
# Open the URL in your browser
```

**Troubleshooting?** See the [Detailed Deployment Steps](#detailed-deployment-steps) below.

---

## Detailed Deployment Steps

### Step 1: Verify Prerequisites

#### Check Docker
```bash
docker --version
# Expected: Docker version 20.10.x or higher

docker ps
# Should show Docker daemon is running
```

**Troubleshooting:**
- Windows: Ensure Docker Desktop is running (system tray icon)
- Linux: `sudo systemctl start docker`
- macOS: Start Docker Desktop from Applications

#### Check Minikube
```bash
minikube version
# Expected: minikube version: v1.30.x or higher
```

**If not installed:**
```bash
# Windows (PowerShell as Administrator)
New-Item -Path 'c:\' -Name 'minikube' -ItemType Directory -Force
Invoke-WebRequest -OutFile 'c:\minikube\minikube.exe' -Uri 'https://github.com/kubernetes/minikube/releases/latest/download/minikube-windows-amd64.exe' -UseBasicParsing

# macOS
brew install minikube

# Linux
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
```

#### Check kubectl
```bash
kubectl version --client
# Expected: Client Version: v1.28.x or higher
```

**If not installed:**
```bash
# Windows (PowerShell as Administrator)
curl.exe -LO "https://dl.k8s.io/release/v1.30.0/bin/windows/amd64/kubectl.exe"
Move-Item -Force kubectl.exe C:\minikube\kubectl.exe

# macOS
brew install kubectl

# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
```

---

### Step 2: Start Minikube Cluster

#### Basic Start (Recommended)
```bash
minikube start --memory=4096 --cpus=2 --driver=docker
```

**Parameters explained:**
- `--memory=4096`: Allocate 4GB RAM (minimum for this project)
- `--cpus=2`: Allocate 2 CPU cores
- `--driver=docker`: Use Docker as the container runtime

#### Advanced Start (Optional)
```bash
# With Kubernetes version specification
minikube start --memory=4096 --cpus=2 --kubernetes-version=v1.28.0

# With specific driver
minikube start --memory=4096 --cpus=2 --driver=hyperv  # Windows Hyper-V
minikube start --memory=4096 --cpus=2 --driver=kvm2    # Linux KVM
minikube start --memory=4096 --cpus=2 --driver=hyperkit # macOS Hyperkit

# With disk size
minikube start --memory=4096 --cpus=2 --disk-size=20g
```

**Verify cluster is running:**
```bash
minikube status
# Expected output:
# minikube
# type: Control Plane
# host: Running
# kubelet: Running
# apiserver: Running
# kubeconfig: Configured

kubectl cluster-info
# Expected: Kubernetes control plane is running at https://...
```

**Troubleshooting:**
```bash
# If Minikube fails to start
minikube delete  # Remove existing cluster
minikube start --memory=4096 --cpus=2 --driver=docker

# Check logs
minikube logs

# SSH into Minikube (debugging)
minikube ssh
```

---

### Step 3: Enable Required Addons

#### Enable Metrics Server (Required for HPA)
```bash
minikube addons enable metrics-server
```

**Verify:**
```bash
kubectl get deployment metrics-server -n kube-system
# Expected: metrics-server deployment with 1/1 READY

# Wait for metrics to be available (takes ~60 seconds)
kubectl top nodes
# Expected: Shows CPU and memory usage
```

#### Enable Ingress (Optional)
```bash
minikube addons enable ingress

# Verify
kubectl get pods -n ingress-nginx
# Expected: ingress-nginx-controller pod Running
```

#### Other Useful Addons
```bash
# Dashboard (web UI for Kubernetes)
minikube addons enable dashboard
minikube dashboard  # Opens in browser

# Registry (local Docker registry)
minikube addons enable registry

# Storage provisioner (for PersistentVolumes)
minikube addons enable storage-provisioner  # Enabled by default
```

**View all addons:**
```bash
minikube addons list
```

---

### Step 4: Configure Docker to Use Minikube

This step ensures Docker images built locally are available inside Minikube without pushing to a remote registry.

#### Linux/macOS
```bash
eval $(minikube docker-env)
```

#### Windows PowerShell
```powershell
minikube docker-env | Invoke-Expression
```

#### Windows Command Prompt
```cmd
@FOR /f "tokens=*" %i IN ('minikube docker-env --shell cmd') DO @%i
```

**Verify configuration:**
```bash
docker ps
# You should see Minikube's containers (k8s_kube-apiserver, etc.)
```

**Important:** This configuration is **per-terminal session**. If you open a new terminal, you must run the command again.

**Permanent configuration (Linux/macOS):**
```bash
# Add to ~/.bashrc or ~/.zshrc
echo 'eval $(minikube docker-env)' >> ~/.bashrc
source ~/.bashrc
```

**To undo (switch back to host Docker):**
```bash
eval $(minikube docker-env --unset)  # Linux/macOS
minikube docker-env --unset | Invoke-Expression  # PowerShell
```

---

### Step 5: Clone Repository and Prepare Data

#### Clone Repository
```bash
git clone https://github.com/yourusername/jalisco-crime-k8s.git
cd jalisco-crime-k8s
```

#### Prepare Crime Data

**Option A: Use provided data (if available)**
```bash
# If data/crime_data.json already exists in the repo
ls -lh data/crime_data.json
# Proceed to next step
```

**Option B: Create sample data**

If you don't have the actual crime data, create a sample for testing:

```bash
mkdir -p data

cat > data/crime_data.json << 'EOF'
{
  "total_records": 357164,
  "by_year": {
    "2020": 71000,
    "2021": 72000,
    "2022": 70500,
    "2023": 69000,
    "2024": 37500,
    "2025": 37164
  },
  "top_delitos": [
    {"delito": "Robo", "count": 85000},
    {"delito": "Lesiones", "count": 50000},
    {"delito": "Violencia familiar", "count": 45000},
    {"delito": "Daño a la propiedad", "count": 30000},
    {"delito": "Amenazas", "count": 25000},
    {"delito": "Fraude", "count": 20000},
    {"delito": "Homicidio", "count": 15000},
    {"delito": "Extorsión", "count": 12000},
    {"delito": "Secuestro", "count": 8000},
    {"delito": "Violación", "count": 7164}
  ],
  "by_municipio": {
    "Guadalajara": 120000,
    "Zapopan": 80000,
    "Tlaquepaque": 35000,
    "Tonalá": 30000,
    "Tlajomulco": 25000,
    "El Salto": 15000,
    "Puerto Vallarta": 12000,
    "Lagos de Moreno": 10000,
    "Tepatitlán": 9000,
    "Ocotlán": 8164
  },
  "sample": [
    {"lat": 20.6737, "lng": -103.3444, "delito": "Robo", "municipio": "Guadalajara", "fecha": "2024-01-15"},
    {"lat": 20.7214, "lng": -103.3918, "delito": "Lesiones", "municipio": "Zapopan", "fecha": "2024-02-20"},
    {"lat": 20.6419, "lng": -103.3127, "delito": "Violencia familiar", "municipio": "Tlaquepaque", "fecha": "2024-03-10"},
    {"lat": 20.6222, "lng": -103.2325, "delito": "Robo", "municipio": "Tonalá", "fecha": "2024-04-05"},
    {"lat": 20.4730, "lng": -103.4618, "delito": "Daño a la propiedad", "municipio": "Tlajomulco", "fecha": "2024-05-12"}
  ],
  "pivot": [
    {"delito": "Robo", "2020": 17000, "2021": 17500, "2022": 17200, "2023": 16800, "2024": 8500, "2025": 8000},
    {"delito": "Lesiones", "2020": 10000, "2021": 10200, "2022": 10100, "2023": 9900, "2024": 5000, "2025": 4800}
  ],
  "delitos_list": ["Robo", "Lesiones", "Violencia familiar", "Daño a la propiedad", "Amenazas", "Fraude", "Homicidio", "Extorsión", "Secuestro", "Violación"],
  "municipios_list": ["Guadalajara", "Zapopan", "Tlaquepaque", "Tonalá", "Tlajomulco", "El Salto", "Puerto Vallarta", "Lagos de Moreno", "Tepatitlán", "Ocotlán"]
}
EOF
```

**Verify data file:**
```bash
cat data/crime_data.json | head -20
# Should show valid JSON
```

---

### Step 6: Build Docker Images

#### Build Backend Image
```bash
docker build -t crime-backend:latest ./backend
```

**Expected output:**
```
[+] Building 45.2s (10/10) FINISHED
 => [internal] load build definition from Dockerfile
 => => transferring dockerfile: 237B
 => [internal] load .dockerignore
 => [1/5] FROM docker.io/library/python:3.11-slim
 => [2/5] WORKDIR /app
 => [3/5] COPY requirements.txt .
 => [4/5] RUN pip install --no-cache-dir -r requirements.txt
 => [5/5] COPY main.py .
 => exporting to image
 => => exporting layers
 => => writing image sha256:abc123...
 => => naming to docker.io/library/crime-backend:latest
```

**Verify:**
```bash
docker images | grep crime-backend
# Expected: crime-backend   latest   abc123...   2 minutes ago   ~180MB
```

**Troubleshooting:**
```bash
# If build fails with network errors
docker build --network=host -t crime-backend:latest ./backend

# Build with no cache (if you made changes)
docker build --no-cache -t crime-backend:latest ./backend

# Test image locally
docker run --rm -p 8000:8000 crime-backend:latest
# Visit http://localhost:8000/health
# Press Ctrl+C to stop
```

#### Build Frontend Image
```bash
docker build -t crime-frontend:latest ./frontend
```

**Expected output:**
```
[+] Building 12.3s (9/9) FINISHED
 => [1/4] FROM docker.io/library/nginx:1.25-alpine
 => [2/4] COPY nginx.conf /etc/nginx/conf.d/default.conf
 => [3/4] COPY index.html /usr/share/nginx/html/
 => [4/4] COPY styles.css app.js /usr/share/nginx/html/
 => exporting to image
 => => naming to docker.io/library/crime-frontend:latest
```

**Verify:**
```bash
docker images | grep crime-frontend
# Expected: crime-frontend   latest   def456...   1 minute ago   ~43MB
```

**Troubleshooting:**
```bash
# Test frontend locally
docker run --rm -p 8080:80 crime-frontend:latest
# Visit http://localhost:8080
# Press Ctrl+C to stop
```

**Check both images:**
```bash
docker images | grep crime
# Expected:
# crime-backend    latest   abc123...   X minutes ago   ~180MB
# crime-frontend   latest   def456...   Y minutes ago   ~43MB
```

---

### Step 7: Create Kubernetes Resources

#### Create Namespace (Optional but Recommended)
```bash
kubectl apply -f k8s/namespace.yaml
```

**Verify:**
```bash
kubectl get namespace crime-dashboard
# Expected: crime-dashboard   Active   5s
```

**If using namespace, update context:**
```bash
kubectl config set-context --current --namespace=crime-dashboard
```

#### Create ConfigMap with Crime Data
```bash
kubectl create configmap crime-data \
  --from-file=crime_data.json=./data/crime_data.json
```

**Verify:**
```bash
kubectl get configmap crime-data
# Expected: crime-data   1      5s

kubectl describe configmap crime-data
# Shows the data content (first 1024 bytes)
```

**Troubleshooting:**
```bash
# If ConfigMap already exists
kubectl delete configmap crime-data
kubectl create configmap crime-data --from-file=crime_data.json=./data/crime_data.json

# View ConfigMap contents
kubectl get configmap crime-data -o yaml

# If data file is too large (>1MB)
# Consider using PersistentVolume or splitting data
ls -lh data/crime_data.json
```

---

### Step 8: Deploy Backend

```bash
kubectl apply -f k8s/backend-deployment.yaml
```

**Expected output:**
```
deployment.apps/crime-backend created
service/crime-backend-svc created
```

**Verify deployment:**
```bash
# Check deployment
kubectl get deployment crime-backend
# Expected: crime-backend   2/2     2            2           30s

# Check pods
kubectl get pods -l app=crime-backend
# Expected:
# NAME                             READY   STATUS    RESTARTS   AGE
# crime-backend-7d9f8c6b5d-abc12   1/1     Running   0          30s
# crime-backend-7d9f8c6b5d-def34   1/1     Running   0          30s

# Check service
kubectl get service crime-backend-svc
# Expected: crime-backend-svc   ClusterIP   10.96.x.x   <none>   8000/TCP   30s
```

**Wait for pods to be ready:**
```bash
kubectl wait --for=condition=ready pod -l app=crime-backend --timeout=120s
```

**Check pod logs:**
```bash
kubectl logs -l app=crime-backend --tail=20
# Expected: Uvicorn running on http://0.0.0.0:8000
```

**Test backend health:**
```bash
# From inside the cluster
kubectl run test --image=curlimages/curl --restart=Never -it --rm -- \
  curl http://crime-backend-svc:8000/health

# Expected: {"status":"healthy",...}
```

**Troubleshooting:**
```bash
# If pods are not starting
kubectl describe pod <pod-name>
# Look at Events section

# Common issues:
# - ImagePullBackOff: Check imagePullPolicy: Never
# - CrashLoopBackOff: Check logs with kubectl logs <pod-name>
# - Pending: Check resource availability with kubectl describe node

# Check ConfigMap is mounted
kubectl exec -it <backend-pod-name> -- ls -la /app/data
# Should show crime_data.json
```

---

### Step 9: Deploy Frontend

```bash
kubectl apply -f k8s/frontend-deployment.yaml
```

**Expected output:**
```
deployment.apps/crime-frontend created
service/crime-frontend-svc created
```

**Verify deployment:**
```bash
# Check deployment
kubectl get deployment crime-frontend
# Expected: crime-frontend   2/2     2            2           30s

# Check pods
kubectl get pods -l app=crime-frontend
# Expected: 2 pods in Running state

# Check service
kubectl get service crime-frontend-svc
# Expected: crime-frontend-svc   NodePort   10.96.x.y   <none>   80:30080/TCP   30s
```

**Wait for pods to be ready:**
```bash
kubectl wait --for=condition=ready pod -l app=crime-frontend --timeout=120s
```

**Troubleshooting:**
```bash
# Check frontend logs
kubectl logs -l app=crime-frontend --tail=20

# Test frontend from inside cluster
kubectl run test --image=curlimages/curl --restart=Never -it --rm -- \
  curl -I http://crime-frontend-svc

# Expected: HTTP/1.1 200 OK
```

---

### Step 10: Deploy Horizontal Pod Autoscaler

```bash
kubectl apply -f k8s/hpa.yaml
```

**Verify HPA:**
```bash
kubectl get hpa crime-backend-hpa
# Expected:
# NAME                 REFERENCE                   TARGETS   MINPODS   MAXPODS   REPLICAS
# crime-backend-hpa    Deployment/crime-backend    15%/60%   2         6         2

# Note: It takes 1-2 minutes for TARGETS to show actual metrics
# Initially shows: <unknown>/60%
```

**Troubleshooting:**
```bash
# If TARGETS shows <unknown>
# 1. Wait 60 seconds for metrics to populate
# 2. Check metrics-server is running
kubectl get deployment metrics-server -n kube-system

# 3. Check if metrics are available
kubectl top pods

# If metrics-server isn't working
minikube addons enable metrics-server
kubectl rollout restart deployment metrics-server -n kube-system
```

---

### Step 11: Verify Complete Deployment

#### Check All Resources
```bash
kubectl get all
```

**Expected output:**
```
NAME                                  READY   STATUS    RESTARTS   AGE
pod/crime-backend-7d9f8c6b5d-abc12   1/1     Running   0          5m
pod/crime-backend-7d9f8c6b5d-def34   1/1     Running   0          5m
pod/crime-frontend-6f8d9c5b4a-ghi56  1/1     Running   0          4m
pod/crime-frontend-6f8d9c5b4a-jkl78  1/1     Running   0          4m

NAME                         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
service/crime-backend-svc    ClusterIP   10.96.10.20     <none>        8000/TCP         5m
service/crime-frontend-svc   NodePort    10.96.10.30     <none>        80:30080/TCP     4m

NAME                             READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/crime-backend    2/2     2            2           5m
deployment.apps/crime-frontend   2/2     2            2           4m

NAME                                        DESIRED   CURRENT   READY   AGE
replicaset.apps/crime-backend-7d9f8c6b5d   2         2         2       5m
replicaset.apps/crime-frontend-6f8d9c5b4a  2         2         2       4m

NAME                                                REFERENCE                   TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
horizontalpodautoscaler.autoscaling/crime-backend-hpa   Deployment/crime-backend    15%/60%   2         6         2          3m
```

#### Health Check Summary
```bash
# All pods running
kubectl get pods --field-selector=status.phase!=Running
# Expected: No resources found (empty output)

# All deployments ready
kubectl get deployments
# Both should show X/X in READY column

# Services have endpoints
kubectl get endpoints
# Both services should have IP addresses listed
```

---

## Deployment Verification

### Automated Verification Script

Create a file `verify-deployment.sh`:

```bash
#!/bin/bash

echo "🔍 Verifying Jalisco Crime Dashboard Deployment..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Minikube
echo "📦 Checking Minikube..."
if minikube status | grep -q "Running"; then
    echo -e "${GREEN}✓ Minikube is running${NC}"
else
    echo -e "${RED}✗ Minikube is not running${NC}"
    exit 1
fi

# Check metrics-server
echo ""
echo "📊 Checking metrics-server..."
if kubectl get deployment metrics-server -n kube-system &> /dev/null; then
    echo -e "${GREEN}✓ metrics-server is deployed${NC}"
else
    echo -e "${YELLOW}⚠ metrics-server is not deployed (HPA won't work)${NC}"
fi

# Check ConfigMap
echo ""
echo "🗂️  Checking ConfigMap..."
if kubectl get configmap crime-data &> /dev/null; then
    echo -e "${GREEN}✓ ConfigMap crime-data exists${NC}"
else
    echo -e "${RED}✗ ConfigMap crime-data not found${NC}"
    exit 1
fi

# Check Backend
echo ""
echo "⚙️  Checking Backend..."
BACKEND_READY=$(kubectl get deployment crime-backend -o jsonpath='{.status.readyReplicas}')
BACKEND_DESIRED=$(kubectl get deployment crime-backend -o jsonpath='{.spec.replicas}')
if [ "$BACKEND_READY" == "$BACKEND_DESIRED" ]; then
    echo -e "${GREEN}✓ Backend: $BACKEND_READY/$BACKEND_DESIRED pods ready${NC}"
else
    echo -e "${RED}✗ Backend: $BACKEND_READY/$BACKEND_DESIRED pods ready${NC}"
fi

# Check Frontend
echo ""
echo "🎨 Checking Frontend..."
FRONTEND_READY=$(kubectl get deployment crime-frontend -o jsonpath='{.status.readyReplicas}')
FRONTEND_DESIRED=$(kubectl get deployment crime-frontend -o jsonpath='{.spec.replicas}')
if [ "$FRONTEND_READY" == "$FRONTEND_DESIRED" ]; then
    echo -e "${GREEN}✓ Frontend: $FRONTEND_READY/$FRONTEND_DESIRED pods ready${NC}"
else
    echo -e "${RED}✗ Frontend: $FRONTEND_READY/$FRONTEND_DESIRED pods ready${NC}"
fi

# Check HPA
echo ""
echo "📈 Checking HPA..."
if kubectl get hpa crime-backend-hpa &> /dev/null; then
    HPA_REPLICAS=$(kubectl get hpa crime-backend-hpa -o jsonpath='{.status.currentReplicas}')
    echo -e "${GREEN}✓ HPA is active (current replicas: $HPA_REPLICAS)${NC}"
else
    echo -e "${YELLOW}⚠ HPA not found${NC}"
fi

# Check Services
echo ""
echo "🌐 Checking Services..."
if kubectl get service crime-backend-svc &> /dev/null; then
    echo -e "${GREEN}✓ Backend service exists${NC}"
fi
if kubectl get service crime-frontend-svc &> /dev/null; then
    echo -e "${GREEN}✓ Frontend service exists${NC}"
fi

# Test Backend Health
echo ""
echo "🏥 Testing Backend Health..."
kubectl run test-backend --image=curlimages/curl --restart=Never -i --rm --quiet -- \
  curl -s http://crime-backend-svc:8000/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backend /health endpoint responding${NC}"
else
    echo -e "${RED}✗ Backend health check failed${NC}"
fi

# Get Access URL
echo ""
echo "🌍 Access Information:"
URL=$(minikube service crime-frontend-svc --url 2>/dev/null)
echo -e "Frontend URL: ${GREEN}$URL${NC}"

echo ""
echo "✅ Deployment verification complete!"
```

**Run verification:**
```bash
chmod +x verify-deployment.sh
./verify-deployment.sh
```

---

## Accessing the Dashboard

### Method 1: Minikube Service (Recommended)

```bash
# Get the URL
minikube service crime-frontend-svc --url

# Example output: http://192.168.49.2:30080
```

**Open this URL in your browser.**

**Alternative (opens browser automatically):**
```bash
minikube service crime-frontend-svc
```

### Method 2: Port Forwarding

Useful if NodePort doesn't work or for debugging:

```bash
# Terminal 1: Forward frontend
kubectl port-forward service/crime-frontend-svc 8080:80

# Terminal 2: Forward backend (for API calls)
kubectl port-forward service/crime-backend-svc 8000:8000

# Access: http://localhost:8080
```

### Method 3: kubectl Proxy

```bash
kubectl proxy --port=8001

# Access:
# http://localhost:8001/api/v1/namespaces/default/services/crime-frontend-svc:80/proxy/
```

### Method 4: Ingress (If Enabled)

```bash
# Enable ingress addon
minikube addons enable ingress

# Apply ingress manifest
kubectl apply -f k8s/ingress.yaml

# Get Minikube IP
minikube ip
# Example: 192.168.49.2

# Add to /etc/hosts (Linux/Mac) or C:\Windows\System32\drivers\etc\hosts (Windows)
echo "192.168.49.2 crime.local" | sudo tee -a /etc/hosts

# Access: http://crime.local
```

---

## Updating the Application

### Update Backend Code

```bash
# 1. Make changes to backend/main.py

# 2. Rebuild image
docker build -t crime-backend:v2 ./backend

# 3. Update deployment
kubectl set image deployment/crime-backend backend=crime-backend:v2

# 4. Watch rollout
kubectl rollout status deployment/crime-backend

# 5. Verify
kubectl rollout history deployment/crime-backend
```

**Rollback if needed:**
```bash
kubectl rollout undo deployment/crime-backend
```

### Update Frontend

```bash
# 1. Make changes to frontend files

# 2. Rebuild image
docker build -t crime-frontend:v2 ./frontend

# 3. Update deployment
kubectl set image deployment/crime-frontend frontend=crime-frontend:v2

# 4. Watch rollout
kubectl rollout status deployment/crime-frontend
```

### Update ConfigMap Data

```bash
# 1. Update data/crime_data.json

# 2. Delete old ConfigMap
kubectl delete configmap crime-data

# 3. Create new ConfigMap
kubectl create configmap crime-data --from-file=crime_data.json=./data/crime_data.json

# 4. Restart backend pods to reload data
kubectl rollout restart deployment/crime-backend
```

### Update Kubernetes Manifests

```bash
# 1. Edit YAML files (e.g., k8s/backend-deployment.yaml)

# 2. Apply changes
kubectl apply -f k8s/backend-deployment.yaml

# Kubernetes automatically updates resources
```

---

## Scaling Operations

### Manual Scaling

**Scale backend:**
```bash
# Scale to 4 replicas
kubectl scale deployment crime-backend --replicas=4

# Verify
kubectl get deployment crime-backend
# Expected: 4/4 ready

# View pods
kubectl get pods -l app=crime-backend
```

**Scale frontend:**
```bash
kubectl scale deployment crime-frontend --replicas=3
```

### Autoscaling with HPA

**View HPA status:**
```bash
kubectl get hpa crime-backend-hpa --watch
```

**Modify HPA:**
```bash
# Change target CPU
kubectl patch hpa crime-backend-hpa -p '{"spec":{"targetCPUUtilizationPercentage":50}}'

# Change replica bounds
kubectl patch hpa crime-backend-hpa -p '{"spec":{"minReplicas":3,"maxReplicas":10}}'
```

**Trigger autoscaling (load test):**
```bash
# Generate load
kubectl run load-test --image=busybox --restart=Never -it --rm -- \
  /bin/sh -c "while true; do wget -q -O- http://crime-backend-svc:8000/api/summary; done"

# In another terminal, watch scaling
kubectl get hpa -w
kubectl get pods -l app=crime-backend -w

# Press Ctrl+C to stop load test
# HPA will scale down after 5 minutes
```

---

## Backup and Restore

### Backup Current State

**Export all manifests:**
```bash
# Create backup directory
mkdir -p backups/$(date +%Y%m%d)

# Export deployments
kubectl get deployments -o yaml > backups/$(date +%Y%m%d)/deployments.yaml

# Export services
kubectl get services -o yaml > backups/$(date +%Y%m%d)/services.yaml

# Export HPA
kubectl get hpa -o yaml > backups/$(date +%Y%m%d)/hpa.yaml

# Export ConfigMaps
kubectl get configmaps crime-data -o yaml > backups/$(date +%Y%m%d)/configmap.yaml
```

**Complete backup script:**
```bash
#!/bin/bash
BACKUP_DIR="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p $BACKUP_DIR

echo "Backing up to $BACKUP_DIR..."

kubectl get all -o yaml > $BACKUP_DIR/all-resources.yaml
kubectl get configmaps -o yaml > $BACKUP_DIR/configmaps.yaml
kubectl get secrets -o yaml > $BACKUP_DIR/secrets.yaml
kubectl get pvc -o yaml > $BACKUP_DIR/pvc.yaml

echo "Backup complete: $BACKUP_DIR"
```

### Restore from Backup

```bash
# Restore from backup directory
kubectl apply -f backups/20260519-120000/
```

---

## Cleanup

### Remove Application (Keep Cluster)

```bash
# Delete HPA
kubectl delete -f k8s/hpa.yaml

# Delete deployments and services
kubectl delete -f k8s/frontend-deployment.yaml
kubectl delete -f k8s/backend-deployment.yaml

# Delete ConfigMap
kubectl delete configmap crime-data

# Verify cleanup
kubectl get all
# Should show no crime-* resources
```

### Complete Cleanup (Remove Everything)

```bash
# If using namespace
kubectl delete namespace crime-dashboard

# Or delete all resources
kubectl delete all --all
kubectl delete configmap --all
kubectl delete hpa --all

# Stop Minikube
minikube stop

# Delete Minikube cluster
minikube delete
```

### Clean Docker Images

```bash
# Remove unused images
docker image prune -a

# Or specifically
docker rmi crime-backend:latest
docker rmi crime-frontend:latest
```

---

## Next Steps

After successful deployment:

1. **Explore the Dashboard**: Try filtering, zooming, clicking markers
2. **Test Autoscaling**: Follow [Demo Scenarios](../README.md#demo-scenarios)
3. **Monitor Resources**: Use `kubectl top pods` and `kubectl top nodes`
4. **Check Logs**: `kubectl logs -f deployment/crime-backend`
5. **Experiment**: Try breaking things to learn how Kubernetes recovers

For production deployment, see [PRODUCTION.md](PRODUCTION.md).

For troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Minikube Documentation](https://minikube.sigs.k8s.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Docker Documentation](https://docs.docker.com/)