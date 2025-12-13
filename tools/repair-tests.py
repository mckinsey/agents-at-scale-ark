
import os
import re

def repair_chainsaw_test(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # The issue is likely "- try:    - script:" on one line
    # We want to replace it with:
    # - try:
    #   - script:
    
    # Regex to find this pattern
    pattern = r'(- try:)[ ]+(- script:)'
    
    if re.search(pattern, content):
        print(f"Repairing {file_path}")
        # We need to calculate correct indentation.
        # Usually "- try:" is indented by N spaces. "- script:" should be N+2 spaces?
        # Actually in the file I saw:
        # 7:     - try:    - script:
        # Indent of try is 4 spaces. indent of script should be 6 spaces (YAML list item child).
        
        # Let's do a more robust replacement.
        # Replace "- try:    - script:" with "- try:\n      - script:"
        # Assuming 4 space indent for try.
        
        # But wait, the file might have different indentation.
        # Let's split lines and fix line by line.
        
        lines = content.split('\n')
        new_lines = []
        for line in lines:
            match = re.search(r'^([ ]*)- try:[ ]+(- script:.*)', line)
            if match:
                indent = match.group(1)
                script_part = match.group(2)
                # Correct indentation for script part (usually +2 spaces for list item content, but since both are list items, 
                # wait.
                # steps:
                # - try:
                #   - script:
                # So if "- try:" has N spaces, "- script:" has N spaces? No.
                # In chainsaw:
                # steps:
                # - try:
                #   - script:
                # or
                # - try:
                #     - script:
                
                # Let's look at `tests/agents/chainsaw-test.yaml` again (from previous turn artifact/view).
                # 6:   steps:
                # 7:     - try:    - script:
                
                # "    - try:" (4 spaces)
                # We want:
                #     - try:
                #     - script:
                # OR
                #     - try:
                #       - script:
                
                # Chainsaw spec: step.try is a list of operations.
                # So "- try:" starts the list.
                # "- script:" is an item in the try list.
                # So it should be indented relative to try?
                # "try" is a field in Step.
                # steps:
                # - name: foo
                #   try:
                #   - script:
                
                # In the file:
                # 6:   steps:
                # 7:     - try:
                
                # This implies "steps" is a list?
                # 6:   steps:
                # 7:     - try:
                
                # If steps is a list, then "- try:" is invalid syntax unless "try" is a key in the list item.
                # It should be:
                # steps:
                # - try:
                
                # If "- try:" is the list item start.
                # Then "try" is the key.
                # The value of try is a list.
                #   - script:
                
                # So indentation of "- script:" should align with "try" key?
                # - try:
                #   - script:
                
                # So 4 spaces for try, 6 spaces for script (2 spaces for indentation of list item).
                
                new_lines.append(f"{indent}- try:")
                new_lines.append(f"{indent}  {script_part}")
            else:
                new_lines.append(line)
        
        with open(file_path, 'w') as f:
            f.write('\n'.join(new_lines))
        return True
    return False

def main():
    root_tests_dir = 'tests'
    for item in os.listdir(root_tests_dir):
        path = os.path.join(root_tests_dir, item)
        if os.path.isdir(path):
            test_file = os.path.join(path, 'chainsaw-test.yaml')
            if os.path.exists(test_file):
                repair_chainsaw_test(test_file)

if __name__ == '__main__':
    main()
