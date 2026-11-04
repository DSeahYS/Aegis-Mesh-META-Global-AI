import { SPEED_OF_LIGHT, type SatelliteStatus, type Vec3 } from './constants';

export interface MeshNode {
  id: string;
  position: Vec3;
  status: SatelliteStatus | string;
  connections: string[];
  computeLoad: number; // 0.0 to 1.0
  activeWorkloads: number;
}

export interface ISLink {
  from: string;
  to: string;
  bandwidth: number; // Gbps
  latency: number; // ms
  qkdSecured: boolean;
  active: boolean;
}

export type MigrationStatus = 'pending' | 'transferring' | 'restoring' | 'complete';

export interface MigrationEvent {
  workloadId: string;
  sourceNode: string;
  targetNode: string;
  progress: number; // 0.0 to 1.0
  dataSize: number; // MB
  status: MigrationStatus;
}

function calculateDistanceKm(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function buildMeshTopology(
  satellites: { id: string; position: Vec3; status: string }[]
): { nodes: MeshNode[]; links: ISLink[] } {
  const n = satellites.length;
  if (n === 0) {
    return { nodes: [], links: [] };
  }

  const adjacencyMap: Map<string, Set<string>> = new Map();
  satellites.forEach((sat) => {
    adjacencyMap.set(sat.id, new Set<string>());
  });

  const linksMap: Map<string, ISLink> = new Map();

  // Connect each node to its 2 to 3 nearest orbital neighbors
  const kNeighbors = Math.min(3, Math.max(1, n - 1));

  for (let i = 0; i < n; i++) {
    const current = satellites[i];
    const distances: { id: string; dist: number }[] = [];

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const other = satellites[j];
      const dist = calculateDistanceKm(current.position, other.position);
      distances.push({ id: other.id, dist });
    }

    distances.sort((a, b) => a.dist - b.dist);

    for (let k = 0; k < kNeighbors && k < distances.length; k++) {
      const neighbor = distances[k];
      const from = current.id < neighbor.id ? current.id : neighbor.id;
      const to = current.id < neighbor.id ? neighbor.id : current.id;
      const linkKey = `${from}<->${to}`;

      if (!linksMap.has(linkKey)) {
        // Optical Inter-Satellite Link speed of light latency
        const latencyMs = Math.round(((neighbor.dist / SPEED_OF_LIGHT) * 1000) * 100) / 100;

        linksMap.set(linkKey, {
          from,
          to,
          bandwidth: 10, // 10 Gbps laser optical terminal
          latency: Math.max(0.5, latencyMs),
          qkdSecured: true,
          active: true,
        });
      }

      adjacencyMap.get(current.id)?.add(neighbor.id);
      adjacencyMap.get(neighbor.id)?.add(current.id);
    }
  }

  const nodes: MeshNode[] = satellites.map((sat, index) => {
    const connections = Array.from(adjacencyMap.get(sat.id) ?? []);
    // Deterministic initial compute load distribution
    const baseLoad = 0.25 + ((index * 37) % 55) / 100;
    const computeLoad = Math.round(baseLoad * 100) / 100;
    const activeWorkloads = Math.floor(computeLoad * 10) + 1;

    return {
      id: sat.id,
      position: sat.position,
      status: sat.status,
      connections,
      computeLoad,
      activeWorkloads,
    };
  });

  return {
    nodes,
    links: Array.from(linksMap.values()),
  };
}

export function simulateMigration(
  sourceId: string,
  targetId: string,
  dataSize: number = 512
): MigrationEvent {
  const workloadId = `wl-${Math.random().toString(36).substring(2, 8)}`;

  return {
    workloadId,
    sourceNode: sourceId,
    targetNode: targetId,
    progress: 0,
    dataSize,
    status: 'pending',
  };
}

export function updateMigration(
  event: MigrationEvent,
  deltaTimeMs: number
): MigrationEvent {
  if (event.status === 'complete') {
    return event;
  }

  // Simulated transfer speed: ~256 MB/s across 10 Gbps optical link
  const transferSpeedMBPerSec = 256;
  const transferredMB = (transferSpeedMBPerSec * deltaTimeMs) / 1000;
  const progressIncrement = transferredMB / Math.max(1, event.dataSize);

  const nextProgress = Math.min(1.0, event.progress + progressIncrement);

  let nextStatus: MigrationStatus;
  if (nextProgress >= 1.0) {
    nextStatus = 'complete';
  } else if (nextProgress >= 0.9) {
    nextStatus = 'restoring';
  } else if (nextProgress > 0.05) {
    nextStatus = 'transferring';
  } else {
    nextStatus = 'pending';
  }

  return {
    ...event,
    progress: Math.round(nextProgress * 1000) / 1000,
    status: nextStatus,
  };
}

export function findOptimalMigrationTarget(
  sourceId: string,
  nodes: MeshNode[],
  links: ISLink[]
): string {
  const sourceNode = nodes.find((n) => n.id === sourceId);
  if (!sourceNode) {
    return '';
  }

  // Active connected neighbors via active ISLinks
  const activeNeighborIds = new Set<string>();
  for (const link of links) {
    if (!link.active) continue;
    if (link.from === sourceId) {
      activeNeighborIds.add(link.to);
    } else if (link.to === sourceId) {
      activeNeighborIds.add(link.from);
    }
  }

  // Fallback to node.connections if links are not yet populated
  if (activeNeighborIds.size === 0) {
    sourceNode.connections.forEach((id) => activeNeighborIds.add(id));
  }

  // Evaluate candidate nodes that are active, not in critical alert, and have spare capacity
  const candidates = nodes.filter(
    (n) =>
      activeNeighborIds.has(n.id) &&
      n.status !== 'critical' &&
      n.computeLoad < 0.9
  );

  if (candidates.length === 0) {
    // If all direct neighbors are busy or critical, evaluate any available node in network
    const fallbackCandidates = nodes.filter(
      (n) => n.id !== sourceId && n.status !== 'critical' && n.computeLoad < 0.95
    );
    if (fallbackCandidates.length === 0) {
      return '';
    }
    fallbackCandidates.sort((a, b) => a.computeLoad - b.computeLoad);
    return fallbackCandidates[0].id;
  }

  // Select connected neighbor with lowest compute load
  candidates.sort((a, b) => a.computeLoad - b.computeLoad);
  return candidates[0].id;
}
