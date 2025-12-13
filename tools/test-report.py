
import os
import yaml
import json

def analyze_test(test_dir):
    chainsaw_file = os.path.join(test_dir, 'chainsaw-test.yaml')
    if not os.path.exists(chainsaw_file):
        return None

    try:
        with open(chainsaw_file, 'r') as f:
            # Handle multi-document yaml
            docs = list(yaml.safe_load_all(f))
            if not docs:
                return None
            
            # Find the Test kind
            test_def = next((d for d in docs if d and d.get('kind') == 'Test'), None)
            if not test_def:
                return None
            
            metadata = test_def.get('metadata', {})
            labels = metadata.get('labels', {})
            is_evaluated = str(labels.get('evaluated', '')).lower() == 'true'
            
            # Check for mock-llm usage in steps
            steps = test_def.get('spec', {}).get('steps', [])
            uses_mock_llm_chart = False
            uses_mock_openai = False
            
            for step in steps:
                try_block = step.get('try', [])
                for item in try_block:
                    script = item.get('script', {})
                    content = script.get('content', '')
                    if 'helm install mock-llm' in content:
                        uses_mock_llm_chart = True
                    
                    apply = item.get('apply', {})
                    file = apply.get('file', '')
                    if 'mock-openai' in file or 'mock-server' in file:
                        uses_mock_openai = True
                        
            # Determine category
            category = 'metric_error'
            if is_evaluated:
                category = 'evaluated'
            elif labels.get('type') == 'standard':
                category = 'standard'
            elif uses_mock_llm_chart:
                category = 'standard' # definitive standard
            elif uses_mock_openai:
                category = 'standard' # older standard
            else:
                # If neither evaluated nor mocked, likely a candidate for refactoring (or strict LLM test)
                category = 'llm'
            
            # Count LOC in directory
            loc = 0
            for root, _, files in os.walk(test_dir):
                for file in files:
                    if file.endswith(('.yaml', '.json', '.sh', '.py')):
                        try:
                            with open(os.path.join(root, file), 'r') as f_count:
                                loc += sum(1 for _ in f_count)
                        except:
                            pass
            
            return {
                'name': metadata.get('name', os.path.basename(test_dir)),
                'category': category,
                'loc': loc,
                'path': test_dir
            }

    except Exception as e:
        print(f"Error processing {test_dir}: {e}")
        return None

import argparse
import sys

def main():
    parser = argparse.ArgumentParser(description='Generate e2e test inventory report')
    parser.add_argument('--fail-on-llm', action='store_true', help='Fail if any tests are categorized as LLM')
    args = parser.parse_args()

    # Assume script is in tools/ and tests/ is in the parent directory
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    root_tests_dir = os.path.join(repo_root, 'tests')
    results = []
    
    # Iterate over immediate subdirectories
    for item in os.listdir(root_tests_dir):
        path = os.path.join(root_tests_dir, item)
        if os.path.isdir(path):
            res = analyze_test(path)
            if res:
                results.append(res)
    
    # Sort by category then name
    results.sort(key=lambda x: (x['category'], x['name']))
    
    print(f"| {'Category':<15} | {'Name':<40} | {'LoC':<10} | {'Path':<50} |")
    print(f"|{'-' * 17}|{'-' * 42}|{'-' * 12}|{'-' * 52}|")
    
    counts = {'evaluated': 0, 'standard': 0, 'llm': 0, 'metric_error': 0}
    
    for r in results:
        counts[r['category']] = counts.get(r['category'], 0) + 1
        print(f"| {r['category']:<15} | {r['name']:<40} | {r['loc']:<10} | {r['path']:<50} |")
        
    print("\n## Summary")
    for k, v in counts.items():
        print(f"- **{k}**: {v}")

    if args.fail_on_llm and counts['llm'] > 0:
        print(f"\nERROR: Found {counts['llm']} tests categorized as 'llm'. Please migrate them to use mock-llm or label them correctly.")
        sys.exit(1)

if __name__ == '__main__':
    main()
