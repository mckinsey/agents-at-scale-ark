from typing import List, Optional

from pydantic import BaseModel


class WorkflowRunParameter(BaseModel):
    name: str
    value: Optional[str] = None


class WorkflowRunLog(BaseModel):
    excerpt: str
    truncated: bool
    source: str


class WorkflowRunNode(BaseModel):
    id: str
    name: str
    display_name: Optional[str] = None
    template_name: Optional[str] = None
    type: str
    phase: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    message: Optional[str] = None
    boundary_id: Optional[str] = None
    children: List[str] = []
    inputs: List[WorkflowRunParameter] = []
    outputs: List[WorkflowRunParameter] = []
    exit_code: Optional[str] = None
    pod_name: Optional[str] = None
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    log: Optional[WorkflowRunLog] = None


class WorkflowRun(BaseModel):
    name: str
    namespace: str
    uid: str
    phase: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    message: Optional[str] = None
    trace_id: Optional[str] = None
    nodes: List[WorkflowRunNode] = []
