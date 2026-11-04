# Model Base URL Runtime Check

Checks that a Model base URL read from a ConfigMap is validated again after the ConfigMap changes, not only at admission.

## What it tests
- A Model whose `baseUrl` comes from a ConfigMap with an in-cluster mock-llm URL becomes available and a Query reaches `done`
- After the ConfigMap is changed to `http://127.0.0.1:1`, the next probe sets `ModelAvailable=False` with reason `BaseURLNotAllowed`
- A new Query against the Model ends in `error` with the policy message and without the rejected URL
- Restoring the ConfigMap brings the Model back to `ModelAvailable=True`

## Running
```bash
chainsaw test
```

Successful completion shows that the controller probe and the executor apply the model URL rules to the value they resolve at runtime.
