import {
  type DagLayout,
  buildWorkflowDag,
  nodeHeight,
} from '@/lib/utils/workflow-dag';

const padding = 24;
const nodeFill = '#ffffff';
const nodeStroke = '#d4d4d8';
const nodeTextColor = '#18181b';
const edgeColor = '#6b7280';
const fontFamily = 'ui-sans-serif, system-ui, sans-serif';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function renderEdges(layout: DagLayout, offsetX: number, offsetY: number) {
  const nodeById = new Map(layout.nodes.map(node => [node.id, node]));

  return layout.edges
    .map(edge => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) return '';

      const sx = round(source.x + source.width + offsetX);
      const sy = round(source.y + nodeHeight / 2 + offsetY);
      const tx = round(target.x + offsetX);
      const ty = round(target.y + nodeHeight / 2 + offsetY);
      const midX = round((sx + tx) / 2);

      const d = `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
      return `  <path d="${d}" fill="none" stroke="${edgeColor}" stroke-width="2" marker-end="url(#arrow)" />`;
    })
    .filter(Boolean)
    .join('\n');
}

function renderNodes(layout: DagLayout, offsetX: number, offsetY: number) {
  return layout.nodes
    .map(node => {
      const x = round(node.x + offsetX);
      const y = round(node.y + offsetY);
      const label = escapeXml(node.label);
      return [
        '  <g>',
        `    <rect x="${x}" y="${y}" width="${node.width}" height="${nodeHeight}" rx="6" ry="6" fill="${nodeFill}" stroke="${nodeStroke}" stroke-width="2" />`,
        `    <text x="${round(x + node.width / 2)}" y="${round(y + nodeHeight / 2)}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamily}" font-size="12" font-weight="500" fill="${nodeTextColor}">${label}</text>`,
        '  </g>',
      ].join('\n');
    })
    .join('\n');
}

export function renderWorkflowDagSvg(manifest: string): string | null {
  const layout = buildWorkflowDag(manifest);

  if ('error' in layout || layout.nodes.length === 0) {
    return null;
  }

  const bounds = layout.nodes.reduce(
    (acc, node) => ({
      minX: Math.min(acc.minX, node.x),
      minY: Math.min(acc.minY, node.y),
      maxX: Math.max(acc.maxX, node.x + node.width),
      maxY: Math.max(acc.maxY, node.y + nodeHeight),
    }),
    {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    },
  );

  const offsetX = padding - bounds.minX;
  const offsetY = padding - bounds.minY;
  const width = round(bounds.maxX - bounds.minX + padding * 2);
  const height = round(bounds.maxY - bounds.minY + padding * 2);

  const edges = renderEdges(layout, offsetX, offsetY);
  const nodes = renderNodes(layout, offsetX, offsetY);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '  <defs>',
    '    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">',
    `      <path d="M 0 0 L 10 5 L 0 10 z" fill="${edgeColor}" />`,
    '    </marker>',
    '  </defs>',
    `  <rect width="${width}" height="${height}" fill="${nodeFill}" />`,
    edges,
    nodes,
    '</svg>',
  ]
    .filter(line => line !== '')
    .join('\n');
}
