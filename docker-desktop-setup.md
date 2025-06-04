# Docker Desktop WSL2 Setup Guide

To properly set up Docker Desktop with WSL2 integration:

1. **In Windows:**
   - Ensure Docker Desktop is running (check system tray)
   - Open Docker Desktop settings
   - Go to Settings → General → Ensure "Use the WSL 2 based engine" is checked
   - Go to Settings → Resources → WSL Integration
   - Enable integration with your WSL2 distro (Ubuntu)
   - Apply & Restart Docker Desktop

2. **After Docker Desktop restart:**
   - Open a new WSL2 terminal (important: must be new terminal)
   - Test with: `docker version`
   - Test with: `kubectl cluster-info`

3. **If still having issues:**
   - In Windows PowerShell (as admin): `wsl --shutdown`
   - Restart Docker Desktop
   - Open new WSL2 terminal

4. **Alternative: Create kind cluster**
   Once Docker is working in WSL2:
   ```bash
   # Create kind cluster
   kind create cluster --name kafka-validation
   
   # Verify
   kubectl cluster-info --context kind-kafka-validation
   ```

5. **If you need to proceed without Docker Desktop:**
   - Use one of your Azure AKS clusters instead
   - Run: `az login` first
   - Then: `az aks get-credentials --resource-group <rg> --name <cluster>`