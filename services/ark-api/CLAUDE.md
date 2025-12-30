## ARK API

### General guidelines
- Put all imports at the top, never import inline
- unpack the ark sdk whl file for guidance on the types.  do not look outside this directory
- only look in the current directory or children unless told explicitly otherwise

### Routes and models
- All routes should be async where possible
- All routes should go in src/ark_api/api/v1
- All pydantic models should go in src/ark_api/models
- Use the handle_k8s_errors decorator for error handling if possible
- Use the with_ark_client async context manager to create an ark-client, but not for secrets
- pass the version and namespace to the with_ark_client
- The sync and async functions on the ark client have the same signatures, the async ones start with a_
- bias towards using async where possible

### Making changes
- After making changes run 'make test' to make sure we didn't break anything