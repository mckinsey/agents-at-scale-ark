#!/usr/bin/env python3
"""Generate Pydantic model from protobuf definition."""

import subprocess
import sys
import tempfile
from pathlib import Path


def generate_model(proto_file: Path, output_file: Path) -> None:
    """
    Generate Pydantic model from protobuf file using protobuf-to-pydantic.

    Args:
        proto_file: Path to .proto file
        output_file: Path to output Python file
    """
    proto_dir = proto_file.parent
    proto_name = proto_file.stem

    with tempfile.TemporaryDirectory() as tmpdir:
        python_out = Path(tmpdir) / "generated"
        python_out.mkdir()

        google_proto_path = Path(__file__).parent.parent.parent.parent
        google_proto_path = google_proto_path / "ark" / "internal" / "eventing" / "proto"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "grpc_tools.protoc",
                f"--proto_path={proto_dir}",
                f"--proto_path={google_proto_path}",
                f"--python_out={python_out}",
                str(proto_file),
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            print(f"Error generating protobuf code: {result.stderr}", file=sys.stderr)
            sys.exit(1)

        sys.path.insert(0, str(python_out))
        try:
            module = __import__(f"{proto_name}_pb2", fromlist=[proto_name])
            event_class = getattr(module, "Event")

            try:
                from protobuf_to_pydantic import msg_to_pydantic_model

                pydantic_code = msg_to_pydantic_model(
                    event_class.DESCRIPTOR,
                    pydantic_version="v2",
                )
            except (ImportError, AttributeError):
                from protobuf_to_pydantic.code_gen import CodeGen

                code_gen = CodeGen(pydantic_version="v2")
                pydantic_code = code_gen.gen_code(event_class.DESCRIPTOR)

            output_file.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, "w") as f:
                f.write('"""Auto-generated Pydantic model from protobuf definition.\n')
                f.write("DO NOT EDIT MANUALLY - Generated from event.proto\n")
                f.write('"""\n\n')
                f.write(pydantic_code)
                f.write("\n")

            print(f"✓ Generated Pydantic model: {output_file}")
        except ImportError as e:
            print(f"Error: Missing dependencies. Install with: uv sync --extra dev", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Error generating model: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            sys.exit(1)
        finally:
            sys.path.remove(str(python_out))


if __name__ == "__main__":
    repo_root = Path(__file__).parent.parent.parent.parent
    proto_file = repo_root / "ark" / "internal" / "eventing" / "proto" / "event.proto"
    output_file = Path(__file__).parent / "src" / "ark_event_recorder" / "core" / "event_model_gen.py"

    if not proto_file.exists():
        print(f"Error: Proto file not found: {proto_file}", file=sys.stderr)
        sys.exit(1)

    generate_model(proto_file, output_file)

