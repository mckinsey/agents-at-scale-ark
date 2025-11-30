#!/usr/bin/env bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Comprehensive MicroK8s Migration Verification...${NC}"

# Function to print status
print_status() {
    if [ "$1" -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        if [ -n "$3" ]; then
            echo -e "${RED}   Details: $3${NC}"
        fi
        # Don't exit immediately to allow other checks to run if possible
        # but mark failure
        FAILED=1
    fi
}

FAILED=0

# 1. Verify File System Changes
echo -e "\n${YELLOW}Checking File System Changes...${NC}"

if [ ! -d "services/localhost-gateway" ]; then
    print_status 0 "services/localhost-gateway directory removed"
else
    print_status 1 "services/localhost-gateway directory still exists"
fi

# 2. Verify Configuration Updates
echo -e "\n${YELLOW}Checking Configuration Files...${NC}"

# Check devspace.yaml for localhost-gateway
if ! grep -q "localhost-gateway" devspace.yaml; then
    print_status 0 "devspace.yaml clean of localhost-gateway"
else
    print_status 1 "devspace.yaml still contains localhost-gateway references"
fi

# Check ark/Makefile for cert-manager helm install
if ! grep -q "helm upgrade --install cert-manager" ark/Makefile; then
    print_status 0 "ark/Makefile clean of cert-manager helm install"
else
    print_status 1 "ark/Makefile still contains cert-manager helm install"
fi

# 3. Verify MicroK8s Environment
echo -e "\n${YELLOW}Checking MicroK8s Environment...${NC}"

if command -v microk8s &> /dev/null; then
    print_status 0 "MicroK8s CLI installed"
    
    echo "Checking MicroK8s status..."
    
    # Check status with timeout and capture output
    if STATUS_OUTPUT=$(perl -e 'alarm 20; exec @ARGV' microk8s status 2>&1); then
        print_status 0 "MicroK8s cluster is running"
        
        # Extract enabled section
        ENABLED_SECTION=$(echo "$STATUS_OUTPUT" | sed -n '/enabled:/,/disabled:/p')
        
        # Check Add-ons
        addons=("dns" "storage" "registry" "ingress")
        for addon in "${addons[@]}"; do
            if echo "$ENABLED_SECTION" | grep -q "$addon"; then
                print_status 0 "Add-on '$addon' enabled"
            else
                print_status 1 "Add-on '$addon' NOT enabled"
            fi
        done
        
        # Check Registry Access
        REGISTRY_HOST="localhost"
        if ! curl -s --connect-timeout 2 http://localhost:32000/v2/ &> /dev/null; then
            # Try to detect VM IP (common on macOS)
            if command -v microk8s &> /dev/null; then
                VM_IP=$(microk8s config | grep server: | sed 's/.*server: https:\/\/\(.*\):.*/\1/')
                if [ -n "$VM_IP" ]; then
                    if curl -s --connect-timeout 2 http://$VM_IP:32000/v2/ &> /dev/null; then
                        REGISTRY_HOST="$VM_IP"
                    fi
                fi
            fi
        fi

        if curl -s --connect-timeout 5 http://$REGISTRY_HOST:32000/v2/ &> /dev/null; then
            print_status 0 "MicroK8s Registry accessible at $REGISTRY_HOST:32000"
        else
            print_status 1 "MicroK8s Registry NOT accessible at localhost:32000 or VM IP" "Ensure registry add-on is enabled and running"
        fi

    else
        print_status 1 "MicroK8s cluster is NOT running or timed out" 
        echo "Output: $STATUS_OUTPUT"
    fi
else
    print_status 1 "MicroK8s CLI not found" "Install with 'brew install ubuntu/microk8s/microk8s'"
fi

# 4. Verify CLI Build
echo -e "\n${YELLOW}Checking CLI Build...${NC}"
if [ -f "tools/ark-cli/package.json" ]; then
    if cd tools/ark-cli && npm run build &> /dev/null; then
        print_status 0 "ark-cli builds successfully"
    else
        print_status 1 "ark-cli build failed"
    fi
    cd ../..
else
    print_status 1 "tools/ark-cli/package.json not found"
fi


echo -e "\n${YELLOW}Verification Summary:${NC}"
if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}🎉 All migration verification checks passed!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some checks failed. Please review the output above.${NC}"
    exit 1
fi
