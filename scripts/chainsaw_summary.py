import json
import os
import sys
import argparse

def summarize_chainsaw_report(report_path):
    if not os.path.exists(report_path):
        print(f"Report file not found: {report_path}")
        return

    with open(report_path) as f:
        data = json.load(f)

    print(f"{'Test Name':40} | {'Result'}")
    print("-" * 55)
    for test in data.get("tests", []):
        test_name = test.get("name", "Unknown")
        failed = False
        for step in test.get("steps", []):
            for op in step.get("operations", []):
                if op.get("type") == "error":
                    failed = True
        result = "✅ Passed" if not failed else "❌ Failed"
        print(f"{test_name:40} | {result}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Summarize Chainsaw test results.")
    parser.add_argument("report_path", nargs="?", default="/tmp/coverage-reports/chainsaw-report.json", help="Path to Chainsaw JSON report")
    args = parser.parse_args()

    summarize_chainsaw_report(args.report_path)