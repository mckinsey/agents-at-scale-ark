
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
    # The try block usually starts a new list item with -, so the script block needs to align with that or be indented if it's a child.
    # In chainsaw, steps: [{try: [...]}]
    # So usually:
    # steps:
    # - try:
    #   - script: 
    
    # We want to produce:
    # - script:
    #     content: ...
    
    # Based on the file content I saw:
    #     - try:
    #       - script:
    #           ...
    
    # The replacement should start with "- script:" indented at the same level as the original "- script:"
    
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

    # Regex to find the env injection script block
    # Matches: whitespace + - script: + any content until value: (json_parse($stdout))
    pattern = r'((\n([ ]+)- script:).*?value: \(json_parse\(\$stdout\)\))'
    
    match = re.search(pattern, content, re.DOTALL)
    if match:
        print(f"Updating chainsaw test: {file_path}")
        original_block = match.group(1)
        original_start_line = match.group(2) # "\n      - script:"
        indent_str = match.group(3) # "      "
        indent_len = len(indent_str)
        
        # Determine the indentation required for the content inside script
        # The block we construct will just paste right over the original block
        # We need to ensure we return a string that fits that spot
        
        # Our regex captured the newline before "- script:", so we should probably keep that or replace it carefully.
        # Let's simple use the indent length to format our block.
        
        new_block = get_helm_install_block(indent_len)
        
        # We replace the captured group 1 (which includes the newline at start) with newline + new_block
        # Wait, if group 1 includes \n, we need to handle it.
        
        replacement = "\n" + indent_str + new_block
        
        new_content = content.replace(original_block, replacement)
        
        with open(file_path, 'w') as f:
            f.write(new_content)
        return True
    
    # Fallback for "skipLogOutput: true" variation if not caught above (regex . matches everything? no, DOTALL makes . match newline)
    # The previous regex might have been too specific or spacing sensitive.
    
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
                    
                    if 'config' not in spec:
                        spec['config'] = {}
                    
                    if 'azure' in spec['config']:
                        del spec['config']['azure']
                    
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
    targets = [
        'tests/agents',
        'tests/queries',
        'tests/model-properties',
        'tests/model-token-usage',
        'tests/query-event-recorder',
        'tests/query-input-type',
        'tests/query-label-selector',
        'tests/query-model-target',
        'tests/query-multiple-targets',
        'tests/query-parameters',
        # 'tests/query-tool-target', # Needs manual fix or smarter regex
        'tests/queries-ttl-timeout',
        'tests/jq-filter-test'
    ]
    
    for t in targets:
        if os.path.exists(t):
            migrate_test(t)

if __name__ == '__main__':
    main()
