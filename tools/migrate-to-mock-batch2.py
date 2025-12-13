
import os
import yaml
import re

# Template for mock-llm-values.yaml
MOCK_VALUES_TEMPLATE = """
ark:
  model:
    enabled: false

config:
  rules:
    - path: "/v1/chat/completions"
      match: "@"
      response:
        status: 200
        content: '{"choices":[{"message":{"role":"assistant","content":"I am a mock response."},"finish_reason":"stop"}]}'
"""

def get_helm_install_block(indent_length):
    indent = " " * indent_length
    # Ensure invalid yaml isn't created by adding newline logic handled by caller
    return f"""- script:
{indent}    content: |
{indent}      helm install mock-llm oci://ghcr.io/dwmkerr/charts/mock-llm \\
{indent}        --version 0.1.25 \\
{indent}        --namespace $NAMESPACE \\
{indent}        --values mock-llm-values.yaml \\
{indent}        --wait --timeout=120s
{indent}    env:
{indent}    - name: NAMESPACE
{indent}      value: ($namespace)"""

def update_chainsaw_test(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Improved Regex to catch typical Azure injection blocks
    # Looking for: - script: ... content: ... echo ... token ...
    # We trap the indent of "- script:"
    
    # Matches:
    # (whitespace)- script:
    # (whitespace)  ...
    # (whitespace)  ... value: (json_parse($stdout))
    
    pattern = r'((\n([ ]+)- script:).*?value: \(json_parse\(\$stdout\)\))'
    
    match = re.search(pattern, content, re.DOTALL)
    if match:
        print(f"Updating chainsaw test: {file_path}")
        original_block = match.group(1)
        original_start_line = match.group(2) # "\n      - script:"
        indent_str = match.group(3) # "      "
        indent_len = len(indent_str)
        
        new_block = get_helm_install_block(indent_len)
        replacement = "\n" + indent_str + new_block
        
        new_content = content.replace(original_block, replacement)
        
        # Check against corrupted replacement from earlier version
        if "- try:    - script:" in new_content:
             print(f"Warning: Produced invalid YAML in {file_path}")
        
        with open(file_path, 'w') as f:
            f.write(new_content)
        return True
    
    return False

def update_model_manifest(file_path):
    try:
        with open(file_path, 'r') as f:
            docs = list(yaml.safe_load_all(f))
        
        changed = False
        new_docs = []
        
        for doc in docs:
            if not doc: continue
            
            if doc.get('kind') == 'Model':
                spec = doc.get('spec', {})
                if spec.get('type') == 'azure' or (spec.get('type') == 'openai' and 'mock' not in str(spec)):
                    print(f"Updating Model manifest: {file_path}")
                    spec['type'] = 'openai'
                    if 'model' in spec:
                        spec['model']['value'] = 'gpt-mock'
                    if 'config' in spec and 'azure' in spec['config']:
                        del spec['config']['azure']
                    
                    if 'config' not in spec: spec['config'] = {}
                    spec['config']['openai'] = {
                        'baseUrl': {'value': 'http://mock-llm.($namespace).svc.cluster.local:8080/v1'},
                        'apiKey': {'value': 'mock-api-key'}
                    }
                    spec['pollInterval'] = '3s'
                    changed = True
            
            new_docs.append(doc)
            
        if changed:
            with open(file_path, 'w') as f:
                yaml.dump_all(new_docs, f, default_flow_style=False)
            return True
            
    except Exception as e:
        print(f"Error updating manifest {file_path}: {e}")
    return False

def migrate_test(test_dir):
    print(f"\nMigrating {test_dir}...")
    
    mock_values_path = os.path.join(test_dir, 'mock-llm-values.yaml')
    if not os.path.exists(mock_values_path):
        with open(mock_values_path, 'w') as f:
            f.write(MOCK_VALUES_TEMPLATE)
    
    chainsaw_path = os.path.join(test_dir, 'chainsaw-test.yaml')
    if os.path.exists(chainsaw_path):
        update_chainsaw_test(chainsaw_path)
    
    manifests_dir = os.path.join(test_dir, 'manifests')
    if os.path.exists(manifests_dir):
        for item in os.listdir(manifests_dir):
            if item.endswith('.yaml'):
                update_model_manifest(os.path.join(manifests_dir, item))

def main():
    # Batch 2 Targets: Features + Teams
    targets = [
        'tests/agent-structured-output',
        'tests/agent-tools-lifecycle',
        'tests/ark-mcp-integration',
        'tests/filesystem-mcp-workspace-isolation',
        
        'tests/team-graph',
        'tests/team-graph-selector',
        'tests/team-of-teams',
        'tests/team-round-robin',
        'tests/team-round-robin-max-turns',
        'tests/team-selector'
    ]
    
    for t in targets:
        if os.path.exists(t):
            migrate_test(t)
        else:
            print(f"Skipping {t} (not found)")

if __name__ == '__main__':
    main()
