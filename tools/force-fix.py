
import os
import re

def fix_file(path):
    with open(path, 'r') as f:
        content = f.read()

    # Pattern 1: - try:    - script: (4 spaces indent for try)
    # Pattern 2: - try:    - script: (no, maybe just - try:- script:)
    # Pattern 3: sequence entries not allowed here errors usually mean:
    # - try:
    # - script: (at same level, but try expects a list, so script should be indented)
    
    # Or:
    # - try:
    #     - script:
    #       - script:
    # If the replacement was done multiple times.
    
    # Let's target the exact broken string we see in artifacts:
    # "    try:    - script:"
    
    fixed = False
    
    # Fix 1: Compressed line
    if re.search(r'try:[ ]+- script:', content):
        print(f"Fixing compressed line in {path}")
        content = re.sub(r'(try:)[ ]+(- script:)', r'\1\n    \2', content) # Assuming 4 space indent for script relative to try?
        # No, try is key, value is list.
        # - try:
        #   - script:
        
        # If original was:
        #     - try:
        # We want:
        #     - try:
        #       - script:
        # (2 extra spaces)
        
        # Check indentation of try line
        lines = content.split('\n')
        new_lines = []
        for line in lines:
            m = re.match(r'^([ ]*)- try:[ ]+(- script:.*)', line)
            if m:
                indent = m.group(1)
                script = m.group(2)
                # indent is likely "    " (4 spaces)
                # script indent should be indent + "  " (2 spaces)
                new_lines.append(f"{indent}- try:")
                new_lines.append(f"{indent}  {script}")
            else:
                new_lines.append(line)
        content = '\n'.join(new_lines)
        fixed = True

    # Fix 2: "NoneType object has no attribute get" usually means empty file? 
    # Or invalid YAML that parses to None. 
    # If file is empty, write default? No, just skip.
    
    with open(path, 'w') as f:
        f.write(content)
    
    return fixed

def main():
    targets = [
        'tests/model-token-usage/chainsaw-test.yaml',
        'tests/query-event-recorder/chainsaw-test.yaml',
        'tests/jq-filter-test/chainsaw-test.yaml',
        'tests/query-multiple-targets/chainsaw-test.yaml',
        'tests/query-model-target/chainsaw-test.yaml',
        'tests/query-input-type/chainsaw-test.yaml',
        # These had NoneType error, might be syntax error preventing parsing
        'tests/queries/chainsaw-test.yaml',
        'tests/agents/chainsaw-test.yaml',
        'tests/queries-ttl-timeout/chainsaw-test.yaml'
    ]
    
    for t in targets:
        if os.path.exists(t):
            fix_file(t)

if __name__ == '__main__':
    main()
