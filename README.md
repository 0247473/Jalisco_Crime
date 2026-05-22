# Jalisco Crime Dashboard

Interactive dashboard for criminal incidence in Jalisco (2020–2025) deployed on a local Kubernetes cluster. Academic project for the **Machine Learning for Large Data Volumes** course.

---

## What is it?

A full-stack web application that visualizes **357,164 records** from the Jalisco criminal incidence dataset, featuring:

- **Interactive map** with geolocation of criminal events
- **Charts** for annual trends, top municipalities, and top crime types
- **Filters** by crime type and municipality
- **Real-time statistics** consumed from a REST API

The entire system runs inside a Kubernetes cluster managed with Minikube, demonstrating concepts such as Pods, Deployments, Services, ConfigMaps, and HPA (Horizontal Pod Autoscaler).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, JavaScript, Leaflet.js, Chart.js, Nginx |
| Backend | Python, FastAPI, Uvicorn |
| Infrastructure | Docker, Kubernetes (Minikube), HPA |
| Data | JSON (IIEG Jalisco criminal incidence 2020–2025) |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              Kubernetes Cluster              │
│                                             │
│  ┌──────────────┐      ┌──────────────┐     │
│  │   Frontend   │─────▶│   Backend    │     │
│  │    (Nginx)   │      │  (FastAPI)   │     │
│  │  2 replicas  │      │  2 replicas  │     │
│  └──────────────┘      └──────┬───────┘     │
│                               │             │
│                      ┌────────▼───────┐     │
│                      │   ConfigMap    │     │
│                      │ crime_data.json│     │
│                      └────────────────┘     │
│                                             │
│  HPA: scales backend between 2–5 replicas   │
└─────────────────────────────────────────────┘
```

---

## Prerequisites

| Tool | Link |
|------|------|
| Docker Desktop | https://www.docker.com/products/docker-desktop/ |
| Minikube | https://minikube.sigs.k8s.io/docs/start/ |
| kubectl | https://kubernetes.io/docs/tasks/tools/ |

---

## Installation

### 1. Extract the project

Unzip the downloaded file and navigate to the project folder in PowerShell:

```powershell
cd C:\Users\YourName\Downloads\jalisco-crime-k8s
```

### 2. Start Minikube

```powershell
minikube start --memory=4096 --cpus=2
minikube addons enable metrics-server
```

### 3. Point Docker to Minikube

```powershell
minikube docker-env | Invoke-Expression
```

> Repeat this step every time you open a new terminal.

### 4. Build Docker images

```powershell
docker build -t crime-backend:latest ./backend
docker build -t crime-frontend:latest ./frontend
```

### 5. Prepare and load the dataset

The dataset exceeds Kubernetes' 1MB ConfigMap limit, so it must be reduced first:

```powershell
$data = Get-Content ./backend/data/crime_data.json | ConvertFrom-Json
$data | Select-Object -First 20000 | ConvertTo-Json -Depth 10 -Compress | Set-Content ./backend/data/crime_data_small.json
```

Verify the file size (must be under 1MB):

```powershell
(Get-Item ./backend/data/crime_data_small.json).Length / 1MB
```

Create the ConfigMap:

```powershell
kubectl create configmap crime-data --from-file=crime_data.json=./backend/data/crime_data_small.json
```

### 6. Deploy to Kubernetes

```powershell
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/hpa.yaml
```

### 7. Wait for pods to be ready

```powershell
kubectl wait --for=condition=ready pod -l app=crime-backend --timeout=120s
kubectl wait --for=condition=ready pod -l app=crime-frontend --timeout=120s
```

### 8. Expose the backend

```powershell
kubectl expose deployment crime-backend --type=NodePort --port=8000 --name=crime-backend-external
```

---

## Accessing the Dashboard

You need **two terminals open simultaneously**:

**Terminal 1 — Backend:**
```powershell
kubectl port-forward svc/crime-backend-svc 8000:8000
```

**Terminal 2 — Frontend:**
```powershell
kubectl port-forward svc/crime-frontend-svc 8080:80
```

Open in your browser:
```
http://localhost:8080
```

> Both terminals must remain open while using the dashboard.

---

## Verification

```powershell
# View status of all resources
kubectl get all

# Confirm all 4 pods are Running
kubectl get pods
```

Expected output: 2 `crime-backend-*` pods and 2 `crime-frontend-*` pods in `Running` state.

To test the backend directly:
```
http://localhost:8000/api/summary
```

---

## Kubernetes Concepts Demonstrated

| Concept | Usage in this project |
|---------|-----------------------|
| **Pod** | Minimum unit — each frontend and backend replica |
| **Deployment** | Manages replicas and rolling updates |
| **Service** | Exposes frontend (NodePort) and backend (ClusterIP) |
| **ConfigMap** | Stores the JSON dataset without hardcoding it in the image |
| **HPA** | Automatically scales the backend between 2 and 5 replicas based on CPU |
| **Self-healing** | Kubernetes automatically restarts crashed pods |

---

## Troubleshooting

**Error: ConfigMap too large**
Reduce the dataset further by changing `20000` to `15000` in step 5.

**Connection error on the dashboard**
Verify that both port-forwards are active in their terminals.

**CSS changes not reflected**
Force a hard reload with `Ctrl + Shift + R`.

**Port-forward closes unexpectedly**
Re-run the command in a dedicated terminal window.

---

## Project Structure

```
jalisco-crime-k8s/
├── backend/
│   ├── main.py          # REST API with FastAPI
│   ├── requirements.txt
│   ├── Dockerfile
│   └── data/
│       └── crime_data.json
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── nginx.conf
│   └── Dockerfile
├── k8s/
│   ├── backend-deployment.yaml
│   ├── frontend-deployment.yaml
│   └── hpa.yaml
└── docker-compose.yml
```

---

## Authors

- Gabriel Zaid Gutierrez Gonzalez — 0244959
- Gabriel Torres Zacarias — 0246183
- Sebastian Avilez Hernandez — 0247473

**Course:** Machine Learning for Large Data Volumes  
**Professor:** Juan Carlos López Pimentel
