# 🔧 Troubleshooting Guide

Comprehensive troubleshooting guide for common issues with the Jalisco Crime Dashboard.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Minikube Issues](#minikube-issues)
- [Pod Issues](#pod-issues)
- [Service Issues](#service-issues)
- [HPA Issues](#hpa-issues)
- [ConfigMap Issues](#configmap-issues)
- [Network Issues](#network-issues)
- [Performance Issues](#performance-issues)
- [Application Issues](#application-issues)
- [Debug Commands Reference](#debug-commands-reference)

---

## Quick Diagnostics

### Run This First

When something isn't working, start with these diagnostic commands:

```bash
# 1. Check cluster status
minikube status

# 2. Check all pods
kubectl get pods -A

# 3. Check your application pods
kubectl get pods -l app=crime-backend
kubectl get pods -l app=crime-frontend

# 4. Check services
kubectl get svc

# 5. Check recent events
kubectl get events --sort-by='.lastTimestamp' | tail -20

# 6. Check resource usage
kubectl top nodes
kubectl top pods
```

### Common Issues Quick Reference

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| Pods stuck in `Pending` | Insufficient resources | `minikube stop && minikube start --memory=4096 --cpus=2` |
| Pods in `ImagePullBackOff` | Image not found | Check `imagePullPolicy: Never` |
| Pods in `CrashLoopBackOff` | Application crash | Check logs: `kubectl logs <pod-name>` |
| HPA shows `<unknown>` | Metrics server not ready | `minikube addons enable metrics-server` |
| Can't access dashboard | Service not exposed | `minikube service crime-frontend-svc --url` |
| Dashboard loads but no data | Backend not reachable | Check port-forward or service |
| High pod restart count | Memory/CPU limits too low | Increase in deployment YAML |

---

## Minikube Issues

### Issue: Minikube Won't Start

**Symptoms:**
```bash
minikube start
# Error: Exiting due to RSRC_INSUFFICIENT_CORES: Requested cpu count 2 is greater than available cpus
```

**Solution 1: Check system resources**
```bash
# Check available resources
# Windows: Task Manager → Performance
# macOS: Activity Monitor
# Linux: htop or top

# Start with lower resources
minikube start --memory=2048 --cpus=1

# Or stop other VMs/containers
docker stop $(docker ps -aq)
```

**Solution 2: Delete and recreate**
```bash
minikube delete
minikube start --memory=4096 --cpus=2 --driver=docker
```

**Solution 3: Change driver**
```bash
# Try different driver
minikube start --memory=4096 --cpus=2 --driver=virtualbox
# Or
minikube start --memory=4096 --cpus=2 --driver=hyperv  # Windows
# Or
minikube start --memory=4096 --cpus=2 --driver=kvm2    # Linux
```

---

### Issue: Minikube IP Not Accessible

**Symptoms:**
```bash
minikube ip
# 192.168.49.2

# But browser shows "Connection refused" or "Unable to connect"
```

**Solution 1: Check Minikube status**
```bash
minikube status
# All components should show "Running"

# If not running
minikube start
```

**Solution 2: Check firewall**
```bash
# Windows: Allow Docker Desktop through firewall
# macOS: System Preferences → Security & Privacy → Firewall
# Linux: Check iptables
sudo iptables -L | grep docker
```

**Solution 3: Use tunnel**
```bash
# Alternative access method
minikube tunnel
# Keep this terminal open
# Access via http://localhost:30080
```

---

### Issue: Docker Env Not Working

**Symptoms:**
```bash
eval $(minikube docker-env)
docker ps
# Shows host Docker containers, not Minikube containers
```

**Solution:**
```bash
# Unset and reset
eval $(minikube docker-env --unset)
eval $(minikube docker-env)

# Verify
docker ps | grep k8s
# Should show Kubernetes containers

# If still not working, check Minikube is running
minikube status
```

---

## Pod Issues

### Issue: Pods Stuck in Pending

**Symptoms:**
```bash
kubectl get pods
# NAME                             READY   STATUS    RESTARTS   AGE
# crime-backend-7d9f8c6b5d-abc12   0/1     Pending   0          5m
```

**Diagnosis:**
```bash
kubectl describe pod <pod-name>
```

**Common Causes & Solutions:**

**Cause 1: Insufficient resources**
```bash
# Check node resources
kubectl describe node minikube | grep -A 5 "Allocated resources"

# If CPU/Memory is at limits, increase Minikube resources
minikube stop
minikube delete
minikube start --memory=4096 --cpus=2
```

**Cause 2: No available nodes**
```bash
kubectl get nodes
# Should show at least one node in "Ready" state

# If no nodes, restart Minikube
minikube stop
minikube start
```

**Cause 3: PersistentVolumeClaim not bound**
```bash
kubectl get pvc
# If STATUS is "Pending"

# Check storage class
kubectl get storageclass

# Enable storage provisioner
minikube addons enable storage-provisioner
```

---

### Issue: Pods in ImagePullBackOff

**Symptoms:**
```bash
kubectl get pods
# NAME                             READY   STATUS             RESTARTS   AGE
# crime-backend-7d9f8c6b5d-abc12   0/1     ImagePullBackOff   0          2m
```

**Diagnosis:**
```bash
kubectl describe pod <pod-name>
# Look for:
# "Failed to pull image "crime-backend:latest": rpc error: code = Unknown desc = Error response from daemon: pull access denied"
```

**Solution 1: Check imagePullPolicy**
```yaml
# In k8s/backend-deployment.yaml, ensure:
spec:
  containers:
  - name: backend
    image: crime-backend:latest
    imagePullPolicy: Never  # ← MUST be "Never" for local images
```

**Solution 2: Rebuild image in Minikube**
```bash
# Point Docker to Minikube
eval $(minikube docker-env)

# Rebuild image
docker build -t crime-backend:latest ./backend

# Verify image exists
docker images | grep crime-backend

# Restart pod
kubectl rollout restart deployment/crime-backend
```

**Solution 3: Check image name**
```bash
# Ensure image name matches exactly
docker images | grep crime
# crime-backend    latest   abc123...

kubectl get deployment crime-backend -o yaml | grep image:
#     image: crime-backend:latest  ← Must match
```

---

### Issue: Pods in CrashLoopBackOff

**Symptoms:**
```bash
kubectl get pods
# NAME                             READY   STATUS             RESTARTS   AGE
# crime-backend-7d9f8c6b5d-abc12   0/1     CrashLoopBackOff   5          3m
```

**Diagnosis:**
```bash
# Check current logs
kubectl logs <pod-name>

# Check previous container logs (if restarted)
kubectl logs <pod-name> --previous

# Describe pod for events
kubectl describe pod <pod-name>
```

**Common Causes & Solutions:**

**Cause 1: Application error**
```bash
kubectl logs <pod-name>
# Example error: ModuleNotFoundError: No module named 'fastapi'

# Solution: Check requirements.txt and rebuild
cat backend/requirements.txt
docker build -t crime-backend:latest ./backend
kubectl rollout restart deployment/crime-backend
```

**Cause 2: ConfigMap not found**
```bash
kubectl logs <pod-name>
# Error: FileNotFoundError: [Errno 2] No such file or directory: '/app/data/crime_data.json'

# Solution: Create ConfigMap
kubectl create configmap crime-data --from-file=crime_data.json=./data/crime_data.json

# Verify mount
kubectl describe pod <pod-name> | grep -A 5 "Mounts:"
```

**Cause 3: Port already in use**
```bash
kubectl logs <pod-name>
# Error: [Errno 98] Address already in use

# Usually not an issue in Kubernetes
# Check for conflicting port definitions in YAML
```

**Cause 4: Out of memory (OOMKilled)**
```bash
kubectl describe pod <pod-name>
# Last State: Terminated
# Reason: OOMKilled

# Solution: Increase memory limits
kubectl edit deployment crime-backend
# Change:
#   limits:
#     memory: "512Mi"  # Increase from 256Mi
```

---

### Issue: Pods Restarting Frequently

**Symptoms:**
```bash
kubectl get pods
# NAME                             READY   STATUS    RESTARTS   AGE
# crime-backend-7d9f8c6b5d-abc12   1/1     Running   15         10m
```

**Diagnosis:**
```bash
# Check restart reason
kubectl describe pod <pod-name>
# Look at "Last State: Terminated" section

# Common reasons:
# - OOMKilled: Out of memory
# - Error: Application crash
# - Liveness probe failed
```

**Solution 1: OOMKilled**
```bash
# Increase memory limits
kubectl edit deployment crime-backend

# Change limits:
resources:
  limits:
    memory: "1Gi"  # Increase
  requests:
    memory: "256Mi"
```

**Solution 2: Liveness probe too aggressive**
```bash
kubectl edit deployment crime-backend

# Adjust probe settings:
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 30  # Increase
  periodSeconds: 30        # Increase
  timeoutSeconds: 10       # Increase
  failureThreshold: 5      # Increase
```

**Solution 3: Application bug**
```bash
# Check logs for errors
kubectl logs <pod-name> --previous

# Fix bug, rebuild, redeploy
docker build -t crime-backend:latest ./backend
kubectl rollout restart deployment/crime-backend
```

---

### Issue: Readiness Probe Failing

**Symptoms:**
```bash
kubectl get pods
# NAME                             READY   STATUS    RESTARTS   AGE
# crime-backend-7d9f8c6b5d-abc12   0/1     Running   0          2m
```

**Diagnosis:**
```bash
kubectl describe pod <pod-name>
# Events:
#   Readiness probe failed: Get http://10.244.0.20:8000/health: dial tcp 10.244.0.20:8000: connect: connection refused
```

**Solution 1: Check application is listening**
```bash
# Exec into pod
kubectl exec -it <pod-name> -- /bin/sh

# Check if process is running
ps aux | grep uvicorn

# Check if port is listening
netstat -tuln | grep 8000
# Or
curl localhost:8000/health

# Exit
exit
```

**Solution 2: Fix health endpoint**
```python
# In backend/main.py, ensure /health exists:
@app.get("/health")
def health():
    return {"status": "ok"}
```

**Solution 3: Adjust probe timing**
```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 10  # Increase if app starts slowly
  periodSeconds: 10
  timeoutSeconds: 5
  successThreshold: 1
  failureThreshold: 3
```

---

## Service Issues

### Issue: Service Has No Endpoints

**Symptoms:**
```bash
kubectl get endpoints crime-backend-svc
# NAME                 ENDPOINTS   AGE
# crime-backend-svc    <none>      5m
```

**Diagnosis:**
```bash
# Check if pods are running
kubectl get pods -l app=crime-backend

# Check if pods are ready
kubectl describe pod <pod-name> | grep "Ready:"

# Check service selector matches pod labels
kubectl get service crime-backend-svc -o yaml | grep selector: -A 2
kubectl get pods --show-labels | grep crime-backend
```

**Solution 1: Label mismatch**
```bash
# Service selector must match pod labels

# Check service selector
kubectl get svc crime-backend-svc -o jsonpath='{.spec.selector}'
# Output: {"app":"crime-backend"}

# Check pod labels
kubectl get pods -l app=crime-backend --show-labels
# Labels must include app=crime-backend

# If mismatch, edit deployment
kubectl edit deployment crime-backend
# Ensure labels match selector
```

**Solution 2: Pods not ready**
```bash
# Wait for pods to pass readiness probe
kubectl wait --for=condition=ready pod -l app=crime-backend --timeout=120s

# If timeout, check readiness probe
kubectl describe pod <pod-name>
```

---

### Issue: Cannot Access Service

**Symptoms:**
```bash
minikube service crime-frontend-svc --url
# http://192.168.49.2:30080

# But browser shows "Connection refused"
```

**Solution 1: Check service type**
```bash
kubectl get svc crime-frontend-svc
# TYPE should be NodePort

# If ClusterIP, change to NodePort
kubectl edit svc crime-frontend-svc
# Change: type: NodePort
```

**Solution 2: Check service has endpoints**
```bash
kubectl get endpoints crime-frontend-svc
# Should show IP addresses

# If empty, check pods
kubectl get pods -l app=crime-frontend
```

**Solution 3: Use port-forward**
```bash
# Alternative access method
kubectl port-forward svc/crime-frontend-svc 8080:80

# Access: http://localhost:8080
```

**Solution 4: Use tunnel**
```bash
# For LoadBalancer services
minikube tunnel
# Keep running, access via external IP
```

---

### Issue: Service DNS Not Working

**Symptoms:**
```bash
# From one pod, cannot reach another by service name
kubectl exec -it <frontend-pod> -- curl http://crime-backend-svc:8000/health
# curl: (6) Could not resolve host: crime-backend-svc
```

**Solution 1: Check CoreDNS**
```bash
# Check CoreDNS pods are running
kubectl get pods -n kube-system -l k8s-app=kube-dns

# If not running, restart
kubectl rollout restart deployment/coredns -n kube-system
```

**Solution 2: Use FQDN**
```bash
# Try full DNS name
kubectl exec -it <pod> -- curl http://crime-backend-svc.default.svc.cluster.local:8000/health
```

**Solution 3: Check resolv.conf**
```bash
# Check DNS configuration in pod
kubectl exec -it <pod> -- cat /etc/resolv.conf
# Should show nameserver (usually 10.96.0.10)

# Should include:
# nameserver 10.96.0.10
# search default.svc.cluster.local svc.cluster.local cluster.local
```

---

## HPA Issues

### Issue: HPA Shows `<unknown>/60%`

**Symptoms:**
```bash
kubectl get hpa
# NAME                 REFERENCE                   TARGETS         MINPODS   MAXPODS   REPLICAS
# crime-backend-hpa    Deployment/crime-backend    <unknown>/60%   2         6         2
```

**Solution 1: Wait for metrics**
```bash
# Metrics take 60-90 seconds to populate
# Wait and check again
sleep 90
kubectl get hpa
```

**Solution 2: Check metrics-server**
```bash
# Check metrics-server is running
kubectl get deployment metrics-server -n kube-system

# If not found, enable it
minikube addons enable metrics-server

# If running but not working, restart
kubectl rollout restart deployment metrics-server -n kube-system

# Wait for metrics-server to be ready
kubectl wait --for=condition=available deployment/metrics-server -n kube-system --timeout=120s
```

**Solution 3: Check metrics availability**
```bash
# Try to get metrics manually
kubectl top nodes
kubectl top pods

# If error: "Metrics API not available"
# Metrics server is not working properly

# Check metrics-server logs
kubectl logs -n kube-system -l k8s-app=metrics-server
```

**Solution 4: Check resource requests**
```bash
# HPA needs resource requests to calculate percentage
kubectl get deployment crime-backend -o yaml | grep -A 5 resources:

# Must have:
resources:
  requests:
    cpu: 100m  # ← Required for HPA
```

---

### Issue: HPA Not Scaling Up

**Symptoms:**
```bash
# CPU is high but replicas don't increase
kubectl get hpa
# NAME                 REFERENCE                   TARGETS    MINPODS   MAXPODS   REPLICAS
# crime-backend-hpa    Deployment/crime-backend    85%/60%    2         6         2
```

**Diagnosis:**
```bash
kubectl describe hpa crime-backend-hpa
# Look at Events section for errors
```

**Solution 1: Check scaling conditions**
```bash
kubectl describe hpa crime-backend-hpa
# Look for:
# AbleToScale: True
# ScalingActive: True
# ScalingLimited: False

# If ScalingLimited: True
# Already at max replicas or blocked
```

**Solution 2: Check for pod disruption budget**
```bash
# PDB might prevent scaling
kubectl get pdb

# If blocking, adjust or delete temporarily
kubectl delete pdb <pdb-name>
```

**Solution 3: Manual test**
```bash
# Manually scale to test
kubectl scale deployment crime-backend --replicas=4

# If this works, HPA is the issue
# If this doesn't work, check deployment constraints
```

---

### Issue: HPA Scaling Too Slowly

**Symptoms:**
- CPU hits 90% but takes 5+ minutes to scale

**Solution: Adjust HPA behavior**
```bash
kubectl edit hpa crime-backend-hpa

# Add or modify:
spec:
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0  # Scale immediately
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15  # Check every 15 seconds
```

---

## ConfigMap Issues

### Issue: ConfigMap Not Found

**Symptoms:**
```bash
kubectl logs <pod-name>
# Error: FileNotFoundError: [Errno 2] No such file or directory: '/app/data/crime_data.json'
```

**Solution:**
```bash
# Check if ConfigMap exists
kubectl get configmap crime-data

# If not found, create it
kubectl create configmap crime-data --from-file=crime_data.json=./data/crime_data.json

# Verify
kubectl describe configmap crime-data

# Restart pods
kubectl rollout restart deployment/crime-backend
```

---

### Issue: ConfigMap Too Large

**Symptoms:**
```bash
kubectl create configmap crime-data --from-file=crime_data.json=./data/crime_data.json
# Error: ConfigMap "crime-data" is invalid: data[crime_data.json]: Too long: must have at most 1048576 bytes
```

**Solution 1: Compress data**
```bash
# Compress JSON
gzip data/crime_data.json

# Create ConfigMap with compressed data
kubectl create configmap crime-data --from-file=crime_data.json.gz=./data/crime_data.json.gz

# Update backend to decompress
# In main.py:
import gzip
with gzip.open(DATA_PATH, 'rt', encoding='utf-8') as f:
    DATA = json.load(f)
```

**Solution 2: Use PersistentVolume**
```yaml
# Create PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: crime-data-pvc
spec:
  accessModes:
    - ReadOnlyMany
  resources:
    requests:
      storage: 100Mi

---
# Mount in deployment
volumes:
- name: data-volume
  persistentVolumeClaim:
    claimName: crime-data-pvc
```

**Solution 3: Use external database**
```bash
# Deploy PostgreSQL
# Load data into database
# Update backend to query database
```

---

### Issue: ConfigMap Data Not Updating

**Symptoms:**
- Updated ConfigMap but pods still use old data

**Solution:**
```bash
# ConfigMaps are cached by pods
# Must restart pods to reload

# Delete and recreate ConfigMap
kubectl delete configmap crime-data
kubectl create configmap crime-data --from-file=crime_data.json=./data/crime_data.json

# Restart deployment
kubectl rollout restart deployment/crime-backend

# Verify new data
kubectl exec -it <pod-name> -- cat /app/data/crime_data.json | head
```

---

## Network Issues

### Issue: Frontend Cannot Reach Backend

**Symptoms:**
- Dashboard loads but shows "Error de Conexión"
- Browser console shows `net::ERR_CONNECTION_REFUSED`

**Diagnosis:**
```bash
# Check backend is running
kubectl get pods -l app=crime-backend

# Check backend service exists
kubectl get svc crime-backend-svc

# Test backend from inside cluster
kubectl run test --image=curlimages/curl --restart=Never -it --rm -- \
  curl http://crime-backend-svc:8000/health
```

**Solution 1: Use port-forward**
```bash
# Frontend JavaScript runs in browser (outside cluster)
# Must use port-forward or Ingress

# Terminal 1: Forward backend
kubectl port-forward svc/crime-backend-svc 8000:8000

# Update frontend JavaScript to use localhost:8000
# In app.js:
const API_URL = 'http://localhost:8000';
```

**Solution 2: Use Ingress**
```bash
# Enable ingress
minikube addons enable ingress

# Apply ingress manifest
kubectl apply -f k8s/ingress.yaml

# Get Minikube IP
minikube ip

# Add to /etc/hosts
echo "$(minikube ip) crime.local" | sudo tee -a /etc/hosts

# Update frontend to use /api path
# Ingress routes /api to backend
const API_URL = '/api';
```

**Solution 3: CORS issue**
```bash
# Check browser console for CORS errors

# Ensure backend allows frontend origin
# In backend/main.py:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or specific frontend URL
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### Issue: Network Policy Blocking Traffic

**Symptoms:**
- Pods cannot communicate after applying NetworkPolicy

**Diagnosis:**
```bash
# Check NetworkPolicies
kubectl get networkpolicies

# Describe specific policy
kubectl describe networkpolicy backend-network-policy
```

**Solution 1: Temporarily remove NetworkPolicy**
```bash
kubectl delete networkpolicy --all

# Test if issue resolves
# If yes, NetworkPolicy was blocking traffic
```

**Solution 2: Fix NetworkPolicy rules**
```yaml
# Ensure frontend can reach backend
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-network-policy
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
          app: crime-frontend  # Allow from frontend
    ports:
    - protocol: TCP
      port: 8000
```

---

## Performance Issues

### Issue: Slow Dashboard Loading

**Symptoms:**
- Dashboard takes >10 seconds to load
- Map is slow to render

**Solution 1: Reduce data points**
```python
# In backend/main.py
@app.get("/api/points")
def points(limit: int = Query(1000, le=5000)):  # Reduce default from 2000
    return {"points": pts[:limit]}
```

**Solution 2: Enable compression**
```nginx
# In frontend/nginx.conf
gzip on;
gzip_vary on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
```

**Solution 3: Scale backend**
```bash
kubectl scale deployment crime-backend --replicas=4
```

**Solution 4: Check resource usage**
```bash
kubectl top pods
# If pods are at CPU/memory limits, increase:

kubectl edit deployment crime-backend
# Increase limits:
resources:
  limits:
    cpu: "1"
    memory: "1Gi"
```

---

### Issue: High Memory Usage

**Symptoms:**
```bash
kubectl top pods
# NAME                             CPU(cores)   MEMORY(bytes)
# crime-backend-7d9f8c6b5d-abc12   50m          450Mi  # Near limit
```

**Solution 1: Increase memory limit**
```bash
kubectl edit deployment crime-backend

resources:
  limits:
    memory: "1Gi"  # Increase from 512Mi
```

**Solution 2: Optimize data loading**
```python
# In backend/main.py
# Instead of loading full dataset, use sampling
def load_data():
    with open(DATA_PATH) as f:
        full_data = json.load(f)
    
    # Keep only needed fields
    DATA["sample"] = [
        {k: v for k, v in point.items() if k in ['lat', 'lng', 'delito', 'municipio']}
        for point in full_data["sample"][:10000]  # Limit to 10k points
    ]
```

---

## Application Issues

### Issue: Map Not Displaying

**Symptoms:**
- Dashboard loads but map is blank
- Console error: `Leaflet is not defined`

**Solution 1: Check CDN loading**
```javascript
// In browser console
typeof L
// Should return "object", not "undefined"

// If undefined, CDN didn't load
// Check internet connection or use local copy
```

**Solution 2: Check API key (if using paid tiles)**
```javascript
// OpenStreetMap doesn't need API key
// But if using Mapbox/Google Maps:
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);
```

**Solution 3: Check coordinates**
```javascript
// Ensure coordinates are valid
console.log(data.points[0]);
// Should have: {lat: 20.6737, lng: -103.344, ...}

// If lat/lng are strings, convert to numbers
const marker = L.marker([parseFloat(point.lat), parseFloat(point.lng)]);
```

---

### Issue: Charts Not Rendering

**Symptoms:**
- Dashboard loads but charts are empty
- Console error: `Chart is not defined`

**Solution 1: Check Chart.js CDN**
```javascript
// In browser console
typeof Chart
// Should return "function"

// If undefined, add CDN to index.html:
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

**Solution 2: Check data format**
```javascript
// In browser console
console.log(summaryData.by_year);
// Should be: {"2020": 71000, "2021": 72000, ...}

// Ensure backend returns correct format
```

**Solution 3: Check canvas element**
```javascript
// Ensure canvas exists in HTML
const canvas = document.getElementById('trendChart');
console.log(canvas);
// Should be: <canvas id="trendChart"></canvas>
```

---

### Issue: Filters Not Working

**Symptoms:**
- Selecting filter and clicking "Apply" does nothing

**Solution 1: Check JavaScript errors**
```javascript
// Open browser console (F12)
// Look for errors

// Common error:
// "Uncaught TypeError: Cannot read property 'value' of null"
// Means element ID doesn't match
```

**Solution 2: Check event listener**
```javascript
// In app.js, ensure event listener is attached
document.getElementById('applyFilters').addEventListener('click', async () => {
    console.log('Filter button clicked');  // Add debug log
    const delito = document.getElementById('delitoFilter').value;
    console.log('Selected delito:', delito);  // Add debug log
    // ...
});
```

**Solution 3: Check API response**
```javascript
// In browser Network tab
// Check /api/points?delito=Robo request
// Should return filtered data

// If empty response, check backend
```

---

## Debug Commands Reference

### Pod Debugging

```bash
# View logs
kubectl logs <pod-name>
kubectl logs <pod-name> --previous  # Previous container
kubectl logs <pod-name> -f          # Follow logs
kubectl logs <pod-name> --tail=50   # Last 50 lines

# Exec into pod
kubectl exec -it <pod-name> -- /bin/sh
kubectl exec -it <pod-name> -- bash

# Port forward
kubectl port-forward <pod-name> 8000:8000

# Get pod details
kubectl describe pod <pod-name>
kubectl get pod <pod-name> -o yaml
kubectl get pod <pod-name> -o jsonpath='{.status.phase}'
```

### Deployment Debugging

```bash
# Check deployment status
kubectl get deployment
kubectl describe deployment <deployment-name>
kubectl rollout status deployment/<deployment-name>

# View deployment history
kubectl rollout history deployment/<deployment-name>

# Scale deployment
kubectl scale deployment <deployment-name> --replicas=3

# Restart deployment
kubectl rollout restart deployment/<deployment-name>

# Rollback deployment
kubectl rollout undo deployment/<deployment-name>
```

### Service Debugging

```bash
# Check service
kubectl get svc
kubectl describe svc <service-name>
kubectl get endpoints <service-name>

# Port forward service
kubectl port-forward svc/<service-name> 8080:80

# Get service URL (Minikube)
minikube service <service-name> --url
```

### Resource Usage

```bash
# Node resources
kubectl top nodes
kubectl describe node minikube

# Pod resources
kubectl top pods
kubectl top pods --containers

# Resource requests/limits
kubectl describe pod <pod-name> | grep -A 10 "Limits:"
```

### Events

```bash
# All events
kubectl get events --sort-by='.lastTimestamp'

# Recent events
kubectl get events --sort-by='.lastTimestamp' | tail -20

# Events for specific pod
kubectl get events --field-selector involvedObject.name=<pod-name>
```

### ConfigMap / Secret

```bash
# List ConfigMaps
kubectl get configmaps

# View ConfigMap
kubectl describe configmap <configmap-name>
kubectl get configmap <configmap-name> -o yaml

# Edit ConfigMap
kubectl edit configmap <configmap-name>

# Delete ConfigMap
kubectl delete configmap <configmap-name>
```

### HPA Debugging

```bash
# Check HPA
kubectl get hpa
kubectl describe hpa <hpa-name>

# Watch HPA
kubectl get hpa -w

# Check metrics
kubectl top pods -l app=crime-backend
```

### Network Debugging

```bash
# Test connectivity from pod
kubectl run test --image=curlimages/curl --restart=Never -it --rm -- curl <url>

# DNS lookup
kubectl run test --image=busybox --restart=Never -it --rm -- nslookup crime-backend-svc

# Network policies
kubectl get networkpolicies
kubectl describe networkpolicy <policy-name>
```

### Minikube Debugging

```bash
# Minikube status
minikube status

# Minikube IP
minikube ip

# SSH into Minikube
minikube ssh

# View Minikube logs
minikube logs

# Dashboard
minikube dashboard

# Addons
minikube addons list
```

---

## Getting Additional Help

If you've tried the troubleshooting steps and still have issues:

1. **Check Kubernetes Events**
   ```bash
   kubectl get events --sort-by='.lastTimestamp' | tail -50
   ```

2. **Gather Diagnostic Info**
   ```bash
   # Create diagnostic report
   kubectl cluster-info dump > cluster-info.txt
   kubectl get all -o yaml > all-resources.yaml
   kubectl logs <pod-name> > pod-logs.txt
   ```

3. **Search Issues**
   - GitHub Issues: [Project Issues](https://github.com/yourusername/jalisco-crime-k8s/issues)
   - Stack Overflow: Tag `kubernetes` + `minikube`
   - Kubernetes Slack: [kubernetes.slack.com](https://kubernetes.slack.com)

4. **Report Bug**
   - Include Kubernetes version: `kubectl version`
   - Include Minikube version: `minikube version`
   - Include logs and events
   - Describe exact steps to reproduce

5. **Documentation**
   - [Kubernetes Docs](https://kubernetes.io/docs/)
   - [Minikube Docs](https://minikube.sigs.k8s.io/docs/)
   - [FastAPI Docs](https://fastapi.tiangolo.com/)

---

**Remember:** Most issues are caused by:
1. Resource constraints (increase Minikube memory/CPU)
2. Image pull issues (ensure `imagePullPolicy: Never`)
3. ConfigMap missing or incorrect
4. Services not exposing correctly
5. Metrics server not running (for HPA)

Start with the basics and work your way up! 🔧