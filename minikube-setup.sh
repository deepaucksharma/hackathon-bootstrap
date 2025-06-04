#!/bin/bash

# Minikube Setup Script for Kafka Testing
# Sets up Minikube with dual Kafka clusters for monitoring

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
MINIKUBE_MEMORY=${MINIKUBE_MEMORY:-8192}
MINIKUBE_CPUS=${MINIKUBE_CPUS:-4}
MINIKUBE_DISK=${MINIKUBE_DISK:-50g}
MINIKUBE_DRIVER=${MINIKUBE_DRIVER:-docker}
PROFILE=${MINIKUBE_PROFILE:-kafka-monitoring}

# Functions
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check minikube
    if ! command -v minikube &> /dev/null; then
        print_error "minikube not found. Please install minikube."
        echo "Visit: https://minikube.sigs.k8s.io/docs/start/"
        exit 1
    fi
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl not found. Please install kubectl."
        exit 1
    fi
    
    # Check Docker (if using docker driver)
    if [ "$MINIKUBE_DRIVER" = "docker" ]; then
        if ! command -v docker &> /dev/null; then
            print_error "Docker not found. Please install Docker or use a different driver."
            exit 1
        fi
        
        if ! docker info &> /dev/null; then
            print_error "Docker is not running. Please start Docker."
            exit 1
        fi
    fi
    
    print_success "All prerequisites met"
}

# Start Minikube
start_minikube() {
    print_header "Starting Minikube"
    
    # Check if profile already exists
    if minikube status -p $PROFILE &> /dev/null; then
        print_warning "Minikube profile '$PROFILE' already exists"
        read -p "Do you want to delete and recreate it? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            minikube delete -p $PROFILE
        else
            print_success "Using existing Minikube profile"
            return
        fi
    fi
    
    # Start Minikube with optimized settings
    echo "Starting Minikube with profile: $PROFILE"
    minikube start \
        -p $PROFILE \
        --driver=$MINIKUBE_DRIVER \
        --memory=$MINIKUBE_MEMORY \
        --cpus=$MINIKUBE_CPUS \
        --disk-size=$MINIKUBE_DISK \
        --kubernetes-version=stable
    
    print_success "Minikube started"
    
    # Enable necessary addons
    print_header "Enabling Minikube Addons"
    minikube addons enable metrics-server -p $PROFILE
    minikube addons enable dashboard -p $PROFILE
    
    print_success "Addons enabled"
}

# Configure kubectl
configure_kubectl() {
    print_header "Configuring kubectl"
    
    # Set kubectl context
    kubectl config use-context $PROFILE
    print_success "kubectl configured to use Minikube"
    
    # Verify connection
    if kubectl cluster-info &> /dev/null; then
        print_success "Connected to Minikube cluster"
    else
        print_error "Failed to connect to cluster"
        exit 1
    fi
}

# Install Strimzi operator (for second Kafka cluster)
install_strimzi() {
    print_header "Installing Strimzi Operator"
    
    # Create namespace
    kubectl create namespace strimzi-kafka --dry-run=client -o yaml | kubectl apply -f -
    
    # Install Strimzi operator
    kubectl create -f "https://strimzi.io/install/latest?namespace=strimzi-kafka" -n strimzi-kafka --dry-run=client -o yaml | kubectl apply -f -
    
    # Wait for operator
    echo "Waiting for Strimzi operator to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/strimzi-cluster-operator -n strimzi-kafka || true
    
    print_success "Strimzi operator installed"
}

# Create namespaces
create_namespaces() {
    print_header "Creating Namespaces"
    
    for ns in kafka strimzi-kafka newrelic; do
        kubectl create namespace $ns --dry-run=client -o yaml | kubectl apply -f -
        print_success "Namespace '$ns' ready"
    done
}

# Deploy sample workload
deploy_sample_kafka() {
    print_header "Deploying Sample Kafka Workload"
    
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-ready-check
  namespace: kafka
data:
  check.sh: |
    #!/bin/bash
    echo "Kafka namespace is ready for deployment"
    echo "Use deploy-dual-kafka.sh to deploy the full Kafka clusters"
EOF
    
    print_success "Sample configuration deployed"
}

# Display information
display_info() {
    print_header "Minikube Kafka Setup Complete"
    
    echo -e "\n${GREEN}Cluster Information:${NC}"
    echo "Profile: $PROFILE"
    echo "Driver: $MINIKUBE_DRIVER"
    echo "Memory: $MINIKUBE_MEMORY MB"
    echo "CPUs: $MINIKUBE_CPUS"
    echo "Disk: $MINIKUBE_DISK"
    
    echo -e "\n${GREEN}Namespaces Created:${NC}"
    echo "- kafka (for simple Kafka cluster)"
    echo "- strimzi-kafka (for Strimzi-managed cluster)"
    echo "- newrelic (for monitoring)"
    
    echo -e "\n${GREEN}Next Steps:${NC}"
    echo "1. Deploy Kafka clusters: ./deploy-dual-kafka.sh deploy"
    echo "2. Verify deployment: ./verify-dual-kafka.sh"
    echo "3. Generate test traffic: ./k8s-consolidated/scripts/simulate-traffic-minikube.sh"
    
    echo -e "\n${GREEN}Useful Commands:${NC}"
    echo "- View dashboard: minikube dashboard -p $PROFILE"
    echo "- Get cluster IP: minikube ip -p $PROFILE"
    echo "- SSH to node: minikube ssh -p $PROFILE"
    echo "- View logs: minikube logs -p $PROFILE"
    echo "- Stop cluster: minikube stop -p $PROFILE"
    echo "- Delete cluster: minikube delete -p $PROFILE"
}

# Cleanup function
cleanup() {
    print_header "Cleaning Up Minikube"
    
    read -p "Are you sure you want to delete the Minikube cluster? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        minikube delete -p $PROFILE
        print_success "Minikube cluster deleted"
    else
        print_warning "Cleanup cancelled"
    fi
}

# Main execution
main() {
    case "${1:-setup}" in
        setup)
            check_prerequisites
            start_minikube
            configure_kubectl
            create_namespaces
            install_strimzi
            deploy_sample_kafka
            display_info
            ;;
        start)
            minikube start -p $PROFILE
            configure_kubectl
            ;;
        stop)
            minikube stop -p $PROFILE
            ;;
        status)
            minikube status -p $PROFILE
            kubectl get nodes
            kubectl get namespaces
            ;;
        cleanup|delete)
            cleanup
            ;;
        *)
            echo "Usage: $0 [setup|start|stop|status|cleanup]"
            echo ""
            echo "Commands:"
            echo "  setup   - Complete setup of Minikube for Kafka (default)"
            echo "  start   - Start existing Minikube cluster"
            echo "  stop    - Stop Minikube cluster"
            echo "  status  - Show cluster status"
            echo "  cleanup - Delete Minikube cluster"
            echo ""
            echo "Environment variables:"
            echo "  MINIKUBE_MEMORY - Memory allocation (default: 8192)"
            echo "  MINIKUBE_CPUS   - CPU allocation (default: 4)"
            echo "  MINIKUBE_DISK   - Disk size (default: 50g)"
            echo "  MINIKUBE_DRIVER - Driver to use (default: docker)"
            echo "  PROFILE         - Minikube profile name (default: kafka-monitoring)"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"