#!/usr/bin/env bash

# Quickstart script to install arkpy CLI tool

set -e -o pipefail

# Configuration
ARK_CONTROLLER_NAME="ark-controller"

# Colors for output
green='\033[0;32m'
red='\033[0;31m'
yellow='\033[1;33m'
white='\033[1;37m'
blue='\033[0;34m'
purple='\033[0;35m'
nc='\033[0m'

# Detect OS and package manager
detect_os_and_pm() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        PM="brew"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        # Check for package managers in order of preference
        if command -v snap >/dev/null 2>&1; then
            PM="snap"
        elif command -v apt >/dev/null 2>&1; then
            PM="apt"
        elif command -v yum >/dev/null 2>&1; then
            PM="yum"
        elif command -v dnf >/dev/null 2>&1; then
            PM="dnf"
        elif command -v pacman >/dev/null 2>&1; then
            PM="pacman"
        elif command -v zypper >/dev/null 2>&1; then
            PM="zypper"
        else
            PM="curl"
        fi
    else
        OS="unknown"
        PM="curl"
    fi
}

# Helper function for prompts with auto-confirm support
prompt_user() {
    local message="$1"
    if [ -n "${ARK_QUICKSTART_PROMPT_YES}" ]; then
        echo "y"
    else
        read -p "$message" -r
        echo "$REPLY"
    fi
}

# Helper function to prompt and check if user confirmed (yes or empty)
prompt_yes_no() {
    local message="$1"
    local reply
    reply=$(prompt_user "$message")
    [[ $reply =~ ^[Yy]$ ]] || [[ -z $reply ]]
}

# Get install command for a tool
get_install_cmd() {
    local tool="$1"
    local fallback_url="$2"
    
    case "$PM" in
        "brew")
            case "$tool" in
                "curl") echo "brew install curl" ;;
                "uv") echo "brew install uv" ;;
                "node") echo "brew install node" ;;
                "timeout") echo "brew install coreutils" ;;
                "ruff") echo "brew install ruff" ;;
                "golang"|"go") echo "brew install go" ;;
                "envsubst") echo "brew install gettext" ;;
                "yq") echo "brew install yq" ;;
                "kubectl") echo "brew install kubectl" ;;
                "docker") echo "brew install --cask docker" ;;
                "helm") echo "brew install helm" ;;
                "npm") echo "brew install node && npm install -g typescript && npm i -D @types/node" ;;
                "java") echo "brew install openjdk" ;;
                "k9s") echo "brew install k9s" ;;
                "chainsaw") echo "brew tap kyverno/chainsaw https://github.com/kyverno/chainsaw && brew install kyverno/chainsaw/chainsaw" ;;
                "minikube") echo "brew install minikube" ;;
                "kind") echo "brew install kind" ;;
                *) echo "brew install $tool" ;;
            esac
            ;;
        "snap")
            case "$tool" in
                "curl") echo "sudo snap install curl" ;;
                "node") echo "sudo snap install node --classic" ;;
                "golang"|"go") echo "sudo snap install go --classic" ;;
                "kubectl") echo "sudo snap install kubectl --classic" ;;
                "docker") echo "sudo snap install docker" ;;
                "helm") echo "sudo snap install helm --classic" ;;
                "yq") echo "sudo snap install yq" ;;
                "k9s") echo "sudo snap install k9s" ;;
                "minikube") echo "sudo snap install minikube" ;;
                "java") echo "sudo snap install openjdk" ;;
                "uv") echo "curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.profile" ;;
                "ruff") echo "curl -LsSf https://astral.sh/ruff/install.sh | sh" ;;
                "envsubst") echo "sudo snap install gettext" ;;
                "timeout") echo "echo 'timeout available in coreutils'" ;;
                "npm") echo "sudo snap install node --classic && npm install -g typescript && npm i -D @types/node" ;;
                "kind") echo "curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64 && chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind" ;;
                "chainsaw") echo "curl -L https://github.com/kyverno/chainsaw/releases/latest/download/chainsaw_linux_x86_64.tar.gz | tar xz && sudo mv chainsaw /usr/local/bin/" ;;
                *) echo "sudo snap install $tool" ;;
            esac
            ;;
        "apt")
            case "$tool" in
                "curl") echo "sudo apt update && sudo apt install -y curl" ;;
                "uv") echo "curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.profile" ;;
                "node") echo "curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs" ;;
                "timeout") echo "sudo apt update && sudo apt install -y coreutils" ;;
                "ruff") echo "curl -LsSf https://astral.sh/ruff/install.sh | sh" ;;
                "golang"|"go") echo "sudo apt update && sudo apt install -y golang-go" ;;
                "envsubst") echo "sudo apt update && sudo apt install -y gettext-base" ;;
                "yq") echo "sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 && sudo chmod +x /usr/local/bin/yq" ;;
                "kubectl") echo "curl -LO \"https://dl.k8s.io/release/\$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl\" && sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl" ;;
                "docker") echo "curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER" ;;
                "helm") echo "curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash" ;;
                "npm") echo "curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs && npm install -g typescript && npm i -D @types/node" ;;
                "java") echo "sudo apt update && sudo apt install -y openjdk-17-jdk" ;;
                "k9s") echo "curl -sS https://webinstall.dev/k9s | bash" ;;
                "chainsaw") echo "curl -L https://github.com/kyverno/chainsaw/releases/latest/download/chainsaw_linux_x86_64.tar.gz | tar xz && sudo mv chainsaw /usr/local/bin/" ;;
                "minikube") echo "curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 && sudo install minikube-linux-amd64 /usr/local/bin/minikube" ;;
                "kind") echo "curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64 && chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind" ;;
                *) echo "sudo apt update && sudo apt install -y $tool" ;;
            esac
            ;;
        "yum"|"dnf")
            local pkg_mgr="$PM"
            case "$tool" in
                "curl") echo "sudo $pkg_mgr install -y curl" ;;
                "uv") echo "curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.profile" ;;
                "node") echo "curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - && sudo $pkg_mgr install -y nodejs" ;;
                "timeout") echo "sudo $pkg_mgr install -y coreutils" ;;
                "ruff") echo "curl -LsSf https://astral.sh/ruff/install.sh | sh" ;;
                "golang"|"go") echo "sudo $pkg_mgr install -y golang" ;;
                "envsubst") echo "sudo $pkg_mgr install -y gettext" ;;
                "yq") echo "sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 && sudo chmod +x /usr/local/bin/yq" ;;
                "kubectl") echo "curl -LO \"https://dl.k8s.io/release/\$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl\" && sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl" ;;
                "docker") echo "curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER" ;;
                "helm") echo "curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash" ;;
                "npm") echo "curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - && sudo $pkg_mgr install -y nodejs && npm install -g typescript && npm i -D @types/node" ;;
                "java") echo "sudo $pkg_mgr install -y java-17-openjdk" ;;
                "k9s") echo "curl -sS https://webinstall.dev/k9s | bash" ;;
                "chainsaw") echo "curl -L https://github.com/kyverno/chainsaw/releases/latest/download/chainsaw_linux_x86_64.tar.gz | tar xz && sudo mv chainsaw /usr/local/bin/" ;;
                "minikube") echo "curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 && sudo install minikube-linux-amd64 /usr/local/bin/minikube" ;;
                "kind") echo "curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64 && chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind" ;;
                *) echo "sudo $pkg_mgr install -y $tool" ;;
            esac
            ;;
        "pacman")
            case "$tool" in
                "curl") echo "sudo pacman -S curl" ;;
                "uv") echo "curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.profile" ;;
                "node") echo "sudo pacman -S nodejs npm" ;;
                "timeout") echo "sudo pacman -S coreutils" ;;
                "ruff") echo "curl -LsSf https://astral.sh/ruff/install.sh | sh" ;;
                "golang"|"go") echo "sudo pacman -S go" ;;
                "envsubst") echo "sudo pacman -S gettext" ;;
                "yq") echo "sudo pacman -S yq" ;;
                "kubectl") echo "sudo pacman -S kubectl" ;;
                "docker") echo "sudo pacman -S docker && sudo systemctl enable docker && sudo usermod -aG docker \$USER" ;;
                "helm") echo "sudo pacman -S helm" ;;
                "npm") echo "sudo pacman -S nodejs npm && npm install -g typescript && npm i -D @types/node" ;;
                "java") echo "sudo pacman -S jdk17-openjdk" ;;
                "k9s") echo "curl -sS https://webinstall.dev/k9s | bash" ;;
                "chainsaw") echo "curl -L https://github.com/kyverno/chainsaw/releases/latest/download/chainsaw_linux_x86_64.tar.gz | tar xz && sudo mv chainsaw /usr/local/bin/" ;;
                "minikube") echo "sudo pacman -S minikube" ;;
                "kind") echo "curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64 && chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind" ;;
                *) echo "sudo pacman -S $tool" ;;
            esac
            ;;
        *)
            # Fallback to curl-based installations
            case "$tool" in
                "curl") echo "echo 'No install method for curl on this platform'" ;;
                "uv") echo "curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.profile" ;;
                "node") echo "curl -fsSL https://nodejs.org/dist/latest/node-latest-linux-x64.tar.xz | tar -xJ --strip-components=1 -C /usr/local/" ;;
                "ruff") echo "curl -LsSf https://astral.sh/ruff/install.sh | sh" ;;
                "kubectl") echo "curl -LO \"https://dl.k8s.io/release/\$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl\" && sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl" ;;
                "docker") echo "curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER" ;;
                "helm") echo "curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash" ;;
                "yq") echo "sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 && sudo chmod +x /usr/local/bin/yq" ;;
                "k9s") echo "curl -sS https://webinstall.dev/k9s | bash" ;;
                "chainsaw") echo "curl -L https://github.com/kyverno/chainsaw/releases/latest/download/chainsaw_linux_x86_64.tar.gz | tar xz && sudo mv chainsaw /usr/local/bin/" ;;
                "minikube") echo "curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 && sudo install minikube-linux-amd64 /usr/local/bin/minikube" ;;
                "kind") echo "curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64 && chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind" ;;
                *) echo "${fallback_url:-echo 'No install method available for $tool'}" ;;
            esac
            ;;
    esac
}

quickstart() {
    # Detect OS and package manager
    detect_os_and_pm
    echo -e "${blue}info${nc}: detected OS: $OS, package manager: $PM"

    # Check if we're in the project root
    if [ ! -f "version.txt" ]; then
        echo -e "${red}error${nc}: must run from project root directory"
        exit 1
    fi

    # Show version banner
    version=$(cat version.txt | tr -d '\n')
    echo -e "${green}ark${nc} quickstart ${white}v${version}${nc}"

    # Log environment configuration
    [ -n "${ARK_QUICKSTART_PROMPT_YES}" ] && echo "ARK_QUICKSTART_PROMPT_YES: ${ARK_QUICKSTART_PROMPT_YES}"
    [ -n "${ARK_QUICKSTART_MODEL_TYPE}" ] && echo "ARK_QUICKSTART_MODEL_TYPE: ${ARK_QUICKSTART_MODEL_TYPE}"
    [ -n "${ARK_QUICKSTART_MODEL_VERSION}" ] && echo "ARK_QUICKSTART_MODEL_VERSION: ${ARK_QUICKSTART_MODEL_VERSION}"
    [ -n "${ARK_QUICKSTART_BASE_URL}" ] && echo "ARK_QUICKSTART_BASE_URL: ${ARK_QUICKSTART_BASE_URL}"
    [ -n "${ARK_QUICKSTART_API_VERSION}" ] && echo "ARK_QUICKSTART_API_VERSION: ${ARK_QUICKSTART_API_VERSION}"
    [ -n "${ARK_QUICKSTART_API_KEY}" ] && echo "ARK_QUICKSTART_API_KEY: (hidden)"
    [ -n "${ARK_QUICKSTART_CONTROLLER_IMAGE}" ] && echo "ARK_QUICKSTART_CONTROLLER_IMAGE: ${ARK_QUICKSTART_CONTROLLER_IMAGE} (enables image caching)"

    # Check essential development tools
    check_tool "curl"
    check_tool "uv"
    check_tool "node"
    check_tool "timeout"
    check_tool "ruff"
    check_tool "golang" "" "go"
    check_tool "envsubst"
    check_tool "yq"
    check_tool "kubectl"
    check_tool "docker"
    check_tool "helm"
    check_tool "npm"
    check_tool "fark" "build_and_install_fark"
    check_tool "ark" "build_and_install_ark_cli"
    check_tool "java" "" "java -version"
    check_optional_tool "k9s"
    check_optional_tool "chainsaw"

    # Check if docker daemon is running
    if ! docker info > /dev/null 2>&1; then
        echo -e "${red}error${nc}: docker daemon not running"
        if [[ "$OS" == "linux" ]]; then
            echo "start docker with: sudo systemctl start docker"
            if prompt_yes_no "start docker now? (Y/n): "; then
                sudo systemctl start docker
                # Add user to docker group if not already
                if ! groups $USER | grep -q docker; then
                    sudo usermod -aG docker $USER
                    echo -e "${yellow}note${nc}: you may need to log out and back in for docker group changes to take effect"
                fi
            fi
        else
            echo "start docker desktop or docker daemon"
        fi
        exit 1
    else
        echo -e "${green}✔${nc} docker daemon running"
    fi

    # Check if kubernetes cluster is accessible
    if kubectl cluster-info > /dev/null 2>&1; then
        echo -e "${green}✔${nc} kubernetes cluster accessible"
    else
        echo -e "${yellow}warning${nc}: kubernetes cluster not accessible"
        echo "make sure your cluster is running and kubectl context is set"
        echo "for local development"
        # check_tool "minikube"
        if is_installed minikube; then
            echo -e "${green}✔${nc} Minikube is installed"
            # if prompt_yes_no "start minikube? (Y/n): "; then
            minikube start
            # fi
        # check_tool "kind"
        elif is_installed kind; then
            echo -e "${green}✔${nc} Kind is installed"
            # if prompt_yes_no "create kind cluster? (Y/n): "; then
            kind create cluster
            # fi
        else
           echo -e "${yellow}⚠${nc} Neither Minikube nor Kind is installed"
            echo "Choose the Kubernetes tool to install:"
            echo "1) Minikube (default)"
            echo "2) Kind"

            read -r -p "Enter choice [1/2]: " choice
            choice=${choice:-1}  # Default to 1 if empty

            if [[ "$choice" == "1" ]]; then
                install_cmd=$(get_install_cmd "minikube")
                eval "$install_cmd"
                minikube start
            elif [[ "$choice" == "2" ]]; then
                install_cmd=$(get_install_cmd "kind")
                eval "$install_cmd"
                kind create cluster
            else
                echo "Invalid choice. Exiting."
                exit 1
            fi
        fi
    fi

    # Note: CRDs will be installed automatically by 'make deploy' via Helm
    echo -e "${blue}info${nc}: cluster resources (CRDs) will be installed automatically during deployment"

    # Check ark controller status, will warn the user if not deployed.
    check_ark_controller

    # Check for default model (cluster is now running and kubectl should work)
    if kubectl get model default >/dev/null 2>&1; then
        echo -e "${green}✔${nc} skipping, as default model is already configured"
    else
        echo -e "${yellow}warning${nc}: no default model configured"
        if prompt_yes_no "create default model? (Y/n): "; then
            # Use environment variables if set, otherwise prompt
            model_type=${ARK_QUICKSTART_MODEL_TYPE:-}
            if [ -z "$model_type" ]; then
                read -p "model type (azure/openai) [default: azure]: " model_type
            fi
            model_type=${model_type:-azure}
            
            # Use environment variables if set, otherwise prompt
            model_version=${ARK_QUICKSTART_MODEL_VERSION:-}
            if [ -z "$model_version" ]; then
                read -p "model version [default: gpt-4.1-mini]: " model_version
            fi
            model_version=${model_version:-"gpt-4.1-mini"}
            
            base_url=${ARK_QUICKSTART_BASE_URL:-}
            if [ -z "$base_url" ]; then
                read -p "enter your base URL: " base_url
            fi
            # Remove trailing slash from base URL (if any)
            base_url=$(echo "$base_url" | sed 's:/*$::')

            # Ask for API version only if Azure
            if [ "$model_type" = "azure" ]; then
                API_VERSION=${ARK_QUICKSTART_API_VERSION:-}
                if [ -z "$API_VERSION" ]; then
                    read -p "enter Azure API version [default: 2024-12-01-preview]: " api_version
                    API_VERSION=${api_version:-2024-12-01-preview}
                fi
            else
                API_VERSION=""
            fi
            
            api_key=${ARK_QUICKSTART_API_KEY:-}
            if [ -z "$api_key" ]; then
                read -s -n 2000 -p  "enter your API key: "   api_key
                echo
            fi
            # Convert to base64 without line wrapping or spaces
            api_key=$(echo -n "$api_key" | base64 | tr -d '\n' | tr -d ' ')
            
            if [ -n "$api_key" ] && [ -n "$base_url" ]; then
                # Use envsubst to apply the configuration
                API_KEY="$api_key" BASE_URL="$base_url" MODEL_TYPE="$model_type" MODEL_VERSION="$model_version" API_VERSION="$API_VERSION" envsubst < samples/quickstart/default-model.yaml | kubectl apply -f -
                
                echo -e "${green}✔${nc} default model configured"
            else
                echo -e "${yellow}warning${nc}: skipping default model setup"
            fi
        else
            echo -e "${yellow}warning${nc}: skipping default model setup"
        fi
    fi

    if kubectl get model default >/dev/null 2>&1; then
        # Check for sample agent
        if kubectl get agent sample-agent >/dev/null 2>&1; then
            kubectl patch agent sample-agent --type='merge' -p='{"spec":{"modelRef":{"name":"default"}}}'
            # Add a simple tool to avoid empty tools array that causes Azure OpenAI API errors
            kubectl apply -f samples/tools/get-coordinates.yaml > /dev/null 2>&1 || true
            kubectl patch agent sample-agent --type='merge' -p='{"spec":{"tools":[{"type":"custom","name":"get-coordinates"}]}}'
                
            echo -e "${green}✔${nc} sample agent re-configured"
        else
            echo -e "${yellow}warning${nc}: no sample agent found"
            if prompt_yes_no "create sample agent? (Y/n): "; then
                # Create sample agent based on the sample
                kubectl apply -f samples/tools/get-coordinates.yaml > /dev/null 2>&1 || true
                cat << EOF | kubectl apply -f -
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: sample-agent
spec:
  prompt: You're a helpful assistant. Provide clear and concise answers.
  modelRef:
    name: default
  tools:
    - type: custom
      name: get-coordinates
EOF
                echo -e "${green}✔${nc} sample agent created"
            else
                echo -e "${yellow}warning${nc}: skipping sample agent setup"
            fi
        fi

        # Test end-to-end functionality with a sample query
        echo "testing system with sample query..."
        if query_output=$(./scripts/query.sh agent/sample-agent "what is 2+2?" 2>&1); then
            echo -e "${green}✔${nc} test query succeeded"
        else
            echo -e "${yellow}warning${nc}: test query failed - system may not be fully ready"
            # Check for specific error types
            if echo "$query_output" | grep -q "403\|Forbidden\|authentication\|unauthorized"; then
                echo -e "${red}error${nc}: Authentication/authorization failed (403)"
                echo "This usually means your API key or credentials are invalid."
                echo ""
                echo "To fix this, create or update your .ark.env file with correct credentials:"
                if [ -f ".ark.env" ]; then
                    echo "  Edit existing .ark.env file:"
                else
                    echo "  Create .ark.env file (copy from .ark.env.local as template):"
                    echo "    cp .ark.env.local .ark.env"
                fi
                echo "  Update these values:"
                echo "    ARK_QUICKSTART_API_KEY=your_actual_api_key"
                echo "    ARK_QUICKSTART_BASE_URL=your_actual_base_url"
                echo ""
                echo -e "Run ${red}make quickstart-reconfigure-default-model${nc} to reconfigure the default model. Then run the ${red}make quickstart${nc} script again."
                echo ""
                echo -e "${red}Exiting due to authentication failure.${nc}"
                exit 1
            elif echo "$query_output" | grep -q "timeout\|timed out"; then
                echo -e "${yellow}note${nc}: Query timed out - the system may be slow to respond"
                echo "Try running a query manually: fark agent sample-agent \"what is 2+2?\""
            else
                echo -e "${yellow}note${nc}: Check controller logs for more details:"
                echo "  kubectl logs -n ark-system deployment/ark-controller"
            fi
        fi
    else
        echo -e "${yellow}warning${nc}: No default model found - skipping sample-agent creation"
    fi


    # Check if dashboard is already installed
    dashboard_installed=false
    if kubectl get deployment -n default ark-dashboard > /dev/null 2>&1; then
        echo -e "${green}✔${nc} ark dashboard installed"
        dashboard_installed=true
    else
        echo -e "${yellow}warning${nc}: ark dashboard not installed"
        if prompt_yes_no "install ark dashboard? (Y/n): "; then
            echo "installing ark dashboard..."
            if make -j2 ark-dashboard-install; then
                echo -e "${green}✔${nc} ark dashboard installed"
                dashboard_installed=true
            else
                echo -e "${red}error${nc}: failed to install ark dashboard"
                echo "install manually with: make -j2 ark-dashboard-install"
            fi
        else
            echo -e "${yellow}warning${nc}: skipping dashboard installation"
        fi
    fi

    # Check if ark-api is already installed
    api_installed=false
    if kubectl get deployment -n default ark-api > /dev/null 2>&1; then
        echo -e "${green}✔${nc} ark-api installed"
        api_installed=true
    else
        echo -e "${yellow}warning${nc}: ark-api not installed"
        if prompt_yes_no "install ark-api? (Y/n): "; then
            echo "installing ark-api..."
            if make -j2 ark-api-install; then
                echo -e "${green}✔${nc} ark-api installed"
                api_installed=true
            else
                echo -e "${red}error${nc}: failed to install ark-api"
                echo "install manually with: make -j2 ark-api-install"
            fi
        else
            echo -e "${yellow}warning${nc}: skipping ark-api installation"
        fi
    fi

    # If dashboard is installed, check port forwarding status
    if [ "$dashboard_installed" = true ]; then
        # Check if port forwarding is already running
        if pgrep -f "kubectl.*port-forward.*8080:80" > /dev/null; then
            echo -e "${green}✔${nc} dashboard port forward already running on localhost:8080"
        else
            if prompt_yes_no "forward dashboard to localhost:8080? (Y/n): "; then
                echo "starting port forward to localhost:8080..."
                kubectl port-forward -n ark-system service/localhost-gateway-nginx 8080:80 > /dev/null 2>&1 &
                PORT_FORWARD_PID=$!
                sleep 2
                # Check if port forward is still running
                if kill -0 $PORT_FORWARD_PID 2>/dev/null; then
                    echo -e "${green}✔${nc} dashboard port forward started on localhost:8080"
                else
                    echo -e "${yellow}warning${nc}: failed to start port forward - port 8080 may be in use"
                    echo "try manually: kubectl port-forward -n ark-system service/localhost-gateway-nginx <port>:80"
                fi
            fi
        fi
    fi

    echo -e "\nquickstart complete! try:\n"
    if [ "$dashboard_installed" = true ]; then
    	echo -e "  dashboard:     ${blue}http://dashboard.127.0.0.1.nip.io:8080/${nc}"
    fi
    if [ "$api_installed" = true ]; then
    	echo -e "  api:           ${blue}http://dashboard.127.0.0.1.nip.io:8080/api/docs/${nc} or ${blue}http://ark-api.127.0.0.1.nip.io:8080/docs/${nc}"
    fi
    echo -e "  docs:          ${blue}https://mckinsey.github.io/agents-at-scale-ark/${nc}"
    echo -e "  show agents:   ${white}kubectl get agents${nc}"
    echo -e "  run a query:   ${white}fark agent sample-agent \"what is 2+2?\"${nc}"
    echo -e "  new project:   ${white}ark generate project my-agents${nc}"
    echo -e "  ark help:      ${white}ark --help${nc}"
    echo -e "                 ${white}# Zsh auto-complete${nc}"
    echo -e "                 ${white}fark completion zsh > ~/.fark-completion && echo 'source ~/.fark-completion' >> ~/.zshrc${nc} # install auto-complete"
    echo -e "                 ${white}# Bash auto-complete${nc}"
    echo -e "                 ${white}fark completion bash > ~/.fark-completion && echo 'source ~/.fark-completion' >> ~/.bashrc${nc} # install auto-complete"
    echo -e "  check cluster: ${white}k9s${nc}"
    # echo -e "  dev server:    ${white}make dev${nc}"
    # echo -e "  add services:  ${white}make services${nc}"
    
    if [[ "$OS" == "linux" ]] && groups $USER | grep -q docker; then
        echo -e "\n${yellow}note${nc}: Docker group changes require logout/login to take effect"
    fi
}

# Helper function to check tools
is_installed() {
    command -v "$1" >/dev/null 2>&1
}

# Helper function to check and optionally install optional tools
check_optional_tool() {
    local tool_name="$1"
    local install_cmd="${2:-$(get_install_cmd "$tool_name")}"
    local check_cmd="${3:-$tool_name}"
    
    if command -v "$check_cmd" > /dev/null 2>&1; then
        echo -e "${green}✔${nc} $tool_name installed"
        return 0
    else
        echo -e "${yellow}warning${nc}: $tool_name not found"
        if prompt_yes_no "install $tool_name? (Y/n): "; then
            echo "installing $tool_name..."
            if eval "$install_cmd" > /dev/null 2>&1; then
                echo -e "${green}✔${nc} $tool_name installed successfully"
                return 0
            else
                echo -e "${red}error${nc}: failed to install $tool_name"
                echo "install manually with: $install_cmd"
                echo -e "${yellow}note${nc}: $tool_name is optional, continuing..."
                return 0
            fi
        else
            echo -e "${yellow}warning${nc}: skipping optional tool $tool_name"
            return 0
        fi
    fi
}

# Helper function to check and optionally install tools
check_tool() {
    local tool_name="$1"
    local install_cmd="${2:-$(get_install_cmd "$tool_name")}"
    local check_cmd="${3:-$tool_name}"

    # set command_flags to have "-v" if check_cmd has no spaces
    local command_flags=(); ! (echo "$check_cmd" | grep -q ' ') && command_flags=("-v")

    if command $command_flags $check_cmd > /dev/null 2>&1; then
        echo -e "${green}✔${nc} $tool_name installed"
        return 0
    else
        echo -e "${yellow}warning${nc}: $tool_name not found"
        if prompt_yes_no "install $tool_name? (Y/n): "; then
            echo "installing $tool_name..."
            if eval "$install_cmd" > /dev/null 2>&1; then
                echo -e "${green}✔${nc} $tool_name installed successfully"
                return 0
            else
                echo -e "${red}error${nc}: failed to install $tool_name"
                echo "install manually with: $install_cmd"
                exit 1
            fi
        else
            echo -e "${red}error${nc}: $tool_name is required for development"
            echo "install with: $install_cmd"
            exit 1
        fi
    fi
}

# Helper function to build and install fark CLI tool
build_and_install_fark() {
    echo "building and installing fark CLI tool..."
    
    # Check if we have the fark service directory
    if [ ! -d "tools/fark" ]; then
        echo -e "${yellow}warning${nc}: fark service directory not found"
        echo "skipping fark installation"
        return 0
    fi
    
    echo "building fark CLI tool..."
    if (make fark-build) > /dev/null 2>&1; then
        echo -e "${green}✔${nc} fark built successfully"
        
        mkdir -p "$HOME/.local/bin" 2>/dev/null || true
        
        if cp out/fark/fark "$HOME/.local/bin/fark" > /dev/null 2>&1 && chmod +x "$HOME/.local/bin/fark" > /dev/null 2>&1; then
            echo -e "${green}✔${nc} fark installed to $HOME/.local/bin/fark"
            
            if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
                echo ""
                echo -e "${yellow}note${nc}: Please add $HOME/.local/bin to your PATH if not already added:"
                echo '  export PATH="$HOME/.local/bin:$PATH"'
                
                # Add to appropriate shell config
                if [[ "$SHELL" == *"zsh"* ]]; then
                    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
                    echo -e "${green}✔${nc} Added to ~/.zshrc"
                elif [[ "$SHELL" == *"bash"* ]]; then
                    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
                    echo -e "${green}✔${nc} Added to ~/.bashrc"
                fi

                export PATH="$HOME/.local/bin:$PATH"
                echo -e "${green}✔${nc} Added to PATH for this session"
            fi
            return 0
        else
            echo -e "${yellow}warning${nc}: failed to install fark to $HOME/.local/bin"
            
            if cp out/fark/fark /usr/local/bin/fark > /dev/null 2>&1 && chmod +x /usr/local/bin/fark > /dev/null 2>&1; then
                echo -e "${green}✔${nc} fark installed to /usr/local/bin"
                return 0
            else
                if sudo cp out/fark/fark /usr/local/bin/fark > /dev/null 2>&1 && sudo chmod +x /usr/local/bin/fark > /dev/null 2>&1; then
                    echo -e "${green}✔${nc} fark installed to /usr/local/bin (with sudo)"
                    return 0
                else
                    echo -e "${yellow}warning${nc}: failed to install fark"
                    echo "you can manually copy with one of these commands:"
                    echo "  mkdir -p \$HOME/.local/bin && cp out/fark/fark \$HOME/.local/bin/fark && chmod +x \$HOME/.local/bin/fark"
                    echo "  sudo cp out/fark/fark /usr/local/bin/fark && sudo chmod +x /usr/local/bin/fark"
                    return 1
                fi
            fi
        fi
    else
        echo -e "${yellow}warning${nc}: failed to build fark"
        echo "you can build manually with: make fark-build"
        return 1
    fi
}

# Helper function to build and install ark CLI tool
build_and_install_ark_cli() {
    echo "building and installing ark CLI tool..."
   
    echo "building ark CLI tool..."
    if (make ark-cli-install) > /dev/null 2>&1; then
        echo -e "${green}✔${nc} ark CLI built successfully"
    else
        echo -e "${yellow}warning${nc}: failed to build ark CLI"
        echo "you can build manually with: (cd tools/ark-cli && npm run build)"
        return 1
    fi
}

# Helper function to check ark controller status.
check_ark_controller() {
    # Has the controller manager been deployed? Is it available?
    if kubectl get deployment -n ark-system ${ARK_CONTROLLER_NAME} > /dev/null 2>&1; then
        if kubectl wait --for=condition=available --timeout=5s deployment/${ARK_CONTROLLER_NAME} -n ark-system > /dev/null 2>&1; then
            version=$(kubectl get pods -n ark-system -l app.kubernetes.io/name=ark -o jsonpath='{.items[0].metadata.labels.app\.kubernetes\.io/version}') 
            echo -e "${green}✔${nc} ark controller running version ${white}${version}${nc}"
        else
            echo -e "${yellow}warning${nc}: ark controller not running"
        fi
    else
        echo -e "${yellow}warning${nc}: ark controller not deployed"
        if prompt_yes_no "deploy ark controller (this can take some time)? (Y/n): "; then
            echo "deploying ark controller..."
            if ! (cd ark && IMAGE="${ARK_QUICKSTART_CONTROLLER_IMAGE:-${ARK_CONTROLLER_NAME}}" IMAGE_TAG="${ARK_QUICKSTART_CONTROLLER_TAG:-latest}" make deploy); then
                echo -e "${red}error${nc}: deployment failed"
                echo
                echo "If you see CRD ownership errors, this means you have an old ARK installation."
                echo "Please recreate your local cluster to start fresh."
                echo
                echo "For minikube: minikube delete && minikube start"
                echo "For kind: kind delete cluster && kind create cluster"
                return
            fi
            # Wait for controller to be ready before webhook validation can work
            kubectl wait --for=condition=available deployment/${ARK_CONTROLLER_NAME} -n ark-system --timeout=300s
            echo -e "${green}✔${nc} ark controller deployed"
        else
            echo -e "${yellow}warning${nc}: skipping ark controller deployment"
        fi
    fi
}

if [ -e .ark.env ]
then
	source .ark.env
fi

# Run the quickstart
quickstart
