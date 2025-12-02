"""Generate Python protobuf code from event.proto file."""

import subprocess
import sys
from pathlib import Path

def generate_proto():
    """Generate Python code from event.proto."""
    # From tests/generate_proto.py, go up to service root, then to repo root
    service_dir = Path(__file__).parent.parent
    repo_root = service_dir.parent.parent
    proto_file = repo_root / "ark" / "internal" / "eventing" / "proto" / "event.proto"
    output_dir = service_dir / "generated"
    
    if not proto_file.exists():
        raise FileNotFoundError(f"Proto file not found: {proto_file}")
    
    # Create output directory structure matching proto package
    output_path = output_dir / "ark" / "internal" / "eventing" / "proto"
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Create __init__.py files
    for init_path in [
        output_dir / "__init__.py",
        output_dir / "ark" / "__init__.py",
        output_dir / "ark" / "internal" / "__init__.py",
        output_dir / "ark" / "internal" / "eventing" / "__init__.py",
        output_dir / "ark" / "internal" / "eventing" / "proto" / "__init__.py",
    ]:
        init_path.parent.mkdir(parents=True, exist_ok=True)
        if not init_path.exists():
            init_path.write_text("")
    
    # Use grpcio-tools.protoc (Python module, no separate install needed)
    try:
        from grpc_tools import protoc
        import grpc_tools
    except ImportError:
        raise ImportError(
            "grpcio-tools not installed. Install with:\n"
            "  uv sync --extra dev\n"
            "  or: pip install grpcio-tools"
        )
    
    # Get google protobuf include path from grpc_tools
    grpc_tools_path = Path(grpc_tools.__file__).parent
    proto_include = str(grpc_tools_path / "_proto")
    
    args = [
        f"--proto_path={repo_root}",
        f"--proto_path={proto_file.parent}",
        f"--proto_path={proto_include}",
        f"--python_out={output_dir}",
        str(proto_file),
    ]
    
    # Run protoc via grpc_tools
    try:
        result = protoc.main(args)
        if result != 0:
            raise RuntimeError(f"protoc returned exit code {result}")
        print(f"✓ Generated Python code in {output_path}")
        return output_dir
    except Exception as e:
        print(f"✗ Failed to generate proto: {e}")
        raise

if __name__ == "__main__":
    generate_proto()

