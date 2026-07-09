import json
import os
import subprocess
import sys
import time

FILES = {
    "query": "/tmp/query.json",  # NOSONAR - single-app container, no other users share /tmp
    "response": "/tmp/response.txt",  # NOSONAR - single-app container, no other users share /tmp
    "phase": "/tmp/phase.txt",  # NOSONAR - single-app container, no other users share /tmp
    "conversation": "/tmp/conversation-id.txt",  # NOSONAR - single-app container, no other users share /tmp
}

def fail(message):
    write_file("response", message)
    print("ark-query: " + message, file=sys.stderr)
    sys.exit(1)

def write_file(file_name, text):
    with open(FILES[file_name], mode="w+") as f:
        f.write(text)

def create_file(file_name):
    write_file(file_name, "")

def kubectl(args, stdin=None):
    return subprocess.run(
        ["kubectl", *args],
        input=stdin,
        text=True,
        capture_output=True,
    )

def parse_target():
    target = os.environ["ARK_TARGET"]

    if "/" not in target:
        fail("invalid target '" + target + "': expected type/name (e.g. agent/weather)")

    target_type, target_name = target.split("/", 1)
    if target_type not in ("agent", "team", "model", "tool"):
        fail("invalid target type '" + target_type + "': expected one of agent|team|model|tool")
    if not target_name:
        fail("invalid target '" + target + "': name is empty")
    
    return target_type, target_name

def clean_metadata(query_obj):
    metadata = query_obj.get("metadata") or {}
    metadata.pop("managedFields", None)
    annotations = metadata.get("annotations") or {}
    annotations.pop("kubectl.kubernetes.io/last-applied-configuration", None)
    if not annotations:
        metadata.pop("annotations", None)
    return query_obj

def parse_parameters():
    try:
        parameters = json.loads(os.environ["ARK_PARAMETERS"])
        if not isinstance(parameters, list):
            raise ValueError
    except ValueError:
        fail("invalid parameters: expected a JSON array of {name,value} objects")

    return parameters

def main(): # NOSONAR - main function of a script.
    write_file("query", "{}")
    create_file("response")
    create_file("phase")
    create_file("conversation")

    target_type, target_name = parse_target()

    parameters = parse_parameters()

    workflow = os.environ["ARK_WORKFLOW_NAME"]
    query_name = os.environ["ARK_QUERY_NAME"] or "q-" + workflow + "-" + os.environ["ARK_POD_NAME"]
    timeout = os.environ["ARK_TIMEOUT"]

    spec = {
        "input": os.environ["ARK_INPUT"],
        "target": {"type": target_type, "name": target_name},
        "timeout": timeout,
        "parameters": parameters,
    }

    if os.environ["ARK_TTL"]:
        spec["ttl"] = os.environ["ARK_TTL"]
    if os.environ["ARK_SESSION_ID"]:
        spec["sessionId"] = os.environ["ARK_SESSION_ID"]
    if os.environ["ARK_MEMORY"]:
        spec["memory"] = {"name": os.environ["ARK_MEMORY"]}
    if os.environ["ARK_SERVICE_ACCOUNT"]:
        spec["serviceAccount"] = os.environ["ARK_SERVICE_ACCOUNT"]

    query_manifest = {
        "apiVersion": "ark.mckinsey.com/v1alpha1",
        "kind": "Query",
        "metadata": {
            "name": query_name,
            "labels": {
                "workflow": workflow
            }
        },
        "spec": spec,
    }

    result = kubectl(["apply", "-f", "-"], stdin=json.dumps(query_manifest))

    if result.returncode != 0:
        fail("failed to create Query " + query_name + ": " + result.stderr.strip())

    kubectl(["wait", "--for=condition=Completed", "--timeout=" + timeout, "query/" + query_name])

    phase = ""
    query_obj = {}
    for _ in range(30):
        result = kubectl(["get", "query", query_name, "-o", "json"])
        if result.returncode == 0:
            query_obj = clean_metadata(json.loads(result.stdout))
            write_file("query", json.dumps(query_obj, separators=(",", ":")))
            phase = (query_obj.get("status") or {}).get("phase", "")
        else:
            query_obj = {}
            write_file("query", "{}")
            phase = ""
        if phase in ("done", "error"):
            break
        time.sleep(1)

    status = query_obj.get("status") or {}

    write_file("phase", phase)
    write_file("response", (status.get("response") or {}).get("content", ""))
    write_file("conversation", status.get("conversationId", ""))

    if phase == "done":
        print("Query " + query_name + " completed: done")
        sys.exit(0)
    else:
        print(
            "Query " + query_name + " did not complete successfully (phase: " + (phase or "<none>") + ")",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
