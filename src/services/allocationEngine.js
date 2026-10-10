/**
 * TITAN Allocation Engine (Pure Service)
 * 
 * Standalone, deterministic bandwidth allocation engine.
 * Free of database, network, framework, or socket dependencies.
 */

// Helper to round to 2 decimal places and prevent floating point drift
export const round2 = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

export const PRIORITY_LEVELS = {
  high: 3,
  medium: 2,
  low: 1,
};

export const DEFAULT_WEIGHTS = {
  high: 5,
  medium: 3,
  low: 1,
};

export const DEFAULT_GUARANTEES = {
  high: 10,
  medium: 5,
  low: 0,
};

/**
 * Validates inputs to ensure strict invariants before running any policy
 */
export const validateAllocationInput = ({
  totalCapacityMbps,
  reservedBandwidthMbps = 0,
  requests = [],
  policyWeights = DEFAULT_WEIGHTS,
  minimumGuarantees = DEFAULT_GUARANTEES,
}) => {
  if (typeof totalCapacityMbps !== 'number' || isNaN(totalCapacityMbps) || totalCapacityMbps < 0) {
    throw new Error('Total capacity must be a non-negative number');
  }

  if (typeof reservedBandwidthMbps !== 'number' || isNaN(reservedBandwidthMbps) || reservedBandwidthMbps < 0) {
    throw new Error('Reserved bandwidth must be a non-negative number');
  }

  if (reservedBandwidthMbps > totalCapacityMbps) {
    throw new Error('Reserved bandwidth cannot exceed total network capacity');
  }

  if (!Array.isArray(requests)) {
    throw new Error('Requests must be provided as an array');
  }

  for (const [index, req] of requests.entries()) {
    if (!req || typeof req !== 'object') {
      throw new Error(`Request at index ${index} is invalid`);
    }
    if (typeof req.desiredMbps !== 'number' || isNaN(req.desiredMbps) || req.desiredMbps <= 0) {
      throw new Error(`Request at index ${index} (${req.id || 'unknown'}) must specify desiredMbps > 0`);
    }
    const priority = (req.priority || 'medium').toLowerCase();
    if (!['high', 'medium', 'low'].includes(priority)) {
      throw new Error(`Request at index ${index} has invalid priority: ${req.priority}`);
    }
  }

  return true;
};

/**
 * Filters and sanitizes eligible requests
 */
const sanitizeRequests = (requests) => {
  return requests
    .filter((r) => r.status !== 'cancelled' && r.status !== 'rejected')
    .map((r, index) => ({
      id: r.id || r._id || `req_${index}`,
      userId: r.userId || (r.user && r.user._id) || r.user || `user_${index}`,
      userName: r.userName || (r.user && r.user.name) || `User ${index + 1}`,
      desiredMbps: round2(r.desiredMbps),
      priority: (r.priority || 'medium').toLowerCase(),
      createdAt: r.createdAt ? new Date(r.createdAt) : new Date(Date.now() - (requests.length - index) * 60000),
      reason: r.reason || '',
      originalIndex: index,
      waitMinutes: typeof r.waitMinutes === 'number' ? r.waitMinutes : 0,
    }));
};

/**
 * Policy A: First Come, First Served (FCFS)
 */
export const runFCFS = ({ totalCapacityMbps, reservedBandwidthMbps, requests }) => {
  const usableCapacity = round2(Math.max(0, totalCapacityMbps - reservedBandwidthMbps));
  const eligibleRequests = sanitizeRequests(requests);

  // Sort by creation time ascending, with original array index as stable tie-breaker
  eligibleRequests.sort((a, b) => {
    const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.originalIndex - b.originalIndex;
  });

  let remaining = usableCapacity;
  let totalAllocated = 0;

  const allocations = eligibleRequests.map((req) => {
    if (remaining <= 0) {
      return {
        id: req.id,
        userId: req.userId,
        userName: req.userName,
        desiredMbps: req.desiredMbps,
        allocatedMbps: 0,
        unmetMbps: req.desiredMbps,
        priority: req.priority,
        effectivePriority: req.priority,
        effectiveWeight: 1,
        status: 'rejected',
        explanation: 'FCFS: Network capacity completely exhausted by earlier requests',
      };
    }

    const grant = round2(Math.min(req.desiredMbps, remaining));
    remaining = round2(remaining - grant);
    totalAllocated = round2(totalAllocated + grant);
    const unmet = round2(Math.max(0, req.desiredMbps - grant));

    let status = 'approved';
    let explanation = `FCFS: Fully allocated (${grant} Mbps) based on submission queue order`;
    if (unmet > 0) {
      status = 'partially_allocated';
      explanation = `FCFS: Partially allocated (${grant} Mbps of desired ${req.desiredMbps} Mbps) due to capacity limit`;
    }

    return {
      id: req.id,
      userId: req.userId,
      userName: req.userName,
      desiredMbps: req.desiredMbps,
      allocatedMbps: grant,
      unmetMbps: unmet,
      priority: req.priority,
      effectivePriority: req.priority,
      effectiveWeight: 1,
      status,
      explanation,
    };
  });

  const totalRequested = round2(eligibleRequests.reduce((sum, r) => sum + r.desiredMbps, 0));
  const unmetDemand = round2(Math.max(0, totalRequested - totalAllocated));

  return {
    policy: 'FCFS',
    totalCapacityMbps: round2(totalCapacityMbps),
    reservedBandwidthMbps: round2(reservedBandwidthMbps),
    usableCapacityMbps: usableCapacity,
    totalAllocatedMbps: totalAllocated,
    remainingCapacityMbps: remaining,
    totalRequestedMbps: totalRequested,
    unmetDemandMbps: unmetDemand,
    requests: allocations,
  };
};

/**
 * Policy B: Priority-Based Allocation (High > Medium > Low)
 */
export const runPriorityBased = ({ totalCapacityMbps, reservedBandwidthMbps, requests }) => {
  const usableCapacity = round2(Math.max(0, totalCapacityMbps - reservedBandwidthMbps));
  const eligibleRequests = sanitizeRequests(requests);

  // Sort by priority descending (high > medium > low), then FCFS creation time, then stable index
  eligibleRequests.sort((a, b) => {
    const pDiff = PRIORITY_LEVELS[b.priority] - PRIORITY_LEVELS[a.priority];
    if (pDiff !== 0) return pDiff;
    const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.originalIndex - b.originalIndex;
  });

  let remaining = usableCapacity;
  let totalAllocated = 0;

  const allocations = eligibleRequests.map((req) => {
    if (remaining <= 0) {
      return {
        id: req.id,
        userId: req.userId,
        userName: req.userName,
        desiredMbps: req.desiredMbps,
        allocatedMbps: 0,
        unmetMbps: req.desiredMbps,
        priority: req.priority,
        effectivePriority: req.priority,
        effectiveWeight: DEFAULT_WEIGHTS[req.priority] || 1,
        status: 'rejected',
        explanation: `Priority: Exhausted before reaching ${req.priority} priority request`,
      };
    }

    const grant = round2(Math.min(req.desiredMbps, remaining));
    remaining = round2(remaining - grant);
    totalAllocated = round2(totalAllocated + grant);
    const unmet = round2(Math.max(0, req.desiredMbps - grant));

    let status = 'approved';
    let explanation = `Priority: Granted full request (${grant} Mbps) under priority [${req.priority.toUpperCase()}]`;
    if (unmet > 0) {
      status = 'partially_allocated';
      explanation = `Priority: Granted partial allocation (${grant} Mbps of desired ${req.desiredMbps} Mbps) under priority [${req.priority.toUpperCase()}]`;
    }

    return {
      id: req.id,
      userId: req.userId,
      userName: req.userName,
      desiredMbps: req.desiredMbps,
      allocatedMbps: grant,
      unmetMbps: unmet,
      priority: req.priority,
      effectivePriority: req.priority,
      effectiveWeight: DEFAULT_WEIGHTS[req.priority] || 1,
      status,
      explanation,
    };
  });

  const totalRequested = round2(eligibleRequests.reduce((sum, r) => sum + r.desiredMbps, 0));
  const unmetDemand = round2(Math.max(0, totalRequested - totalAllocated));

  return {
    policy: 'PRIORITY',
    totalCapacityMbps: round2(totalCapacityMbps),
    reservedBandwidthMbps: round2(reservedBandwidthMbps),
    usableCapacityMbps: usableCapacity,
    totalAllocatedMbps: totalAllocated,
    remainingCapacityMbps: remaining,
    totalRequestedMbps: totalRequested,
    unmetDemandMbps: unmetDemand,
    requests: allocations,
  };
};

/**
 * Policy C: Adaptive Priority-Aware Fair Sharing with Minimum Guarantees & Starvation Mitigation
 */
export const runAdaptive = ({
  totalCapacityMbps,
  reservedBandwidthMbps = 0,
  requests = [],
  policyWeights = DEFAULT_WEIGHTS,
  minimumGuarantees = DEFAULT_GUARANTEES,
  enableAging = true,
  agingWaitThresholdMinutes = 5,
}) => {
  const usableCapacity = round2(Math.max(0, totalCapacityMbps - reservedBandwidthMbps));
  const eligibleRequests = sanitizeRequests(requests);

  if (eligibleRequests.length === 0 || usableCapacity <= 0) {
    return {
      policy: 'ADAPTIVE',
      totalCapacityMbps: round2(totalCapacityMbps),
      reservedBandwidthMbps: round2(reservedBandwidthMbps),
      usableCapacityMbps: usableCapacity,
      totalAllocatedMbps: 0,
      remainingCapacityMbps: usableCapacity,
      totalRequestedMbps: round2(eligibleRequests.reduce((s, r) => s + r.desiredMbps, 0)),
      unmetDemandMbps: round2(eligibleRequests.reduce((s, r) => s + r.desiredMbps, 0)),
      requests: eligibleRequests.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.userName,
        desiredMbps: r.desiredMbps,
        allocatedMbps: 0,
        unmetMbps: r.desiredMbps,
        priority: r.priority,
        effectivePriority: r.priority,
        effectiveWeight: 1,
        status: 'rejected',
        explanation: 'Usable bandwidth is zero or no requests',
      })),
    };
  }

  // 1. Calculate effective priority & effective weights with aging
  const state = eligibleRequests.map((r) => {
    let effectivePriority = r.priority;
    let baseWeight = policyWeights[r.priority] || DEFAULT_WEIGHTS[r.priority] || 1;
    let aged = false;

    // Waiting-time aging: calculate duration in minutes
    let waitMinutes = r.waitMinutes;
    if (r.createdAt) {
      const diffMs = Math.max(0, Date.now() - r.createdAt.getTime());
      waitMinutes = Math.max(waitMinutes, Math.floor(diffMs / 60000));
    }

    if (enableAging && waitMinutes >= agingWaitThresholdMinutes) {
      aged = true;
      // Mitigate starvation: promote priority one level or scale weight
      if (r.priority === 'low') effectivePriority = 'medium';
      else if (r.priority === 'medium') effectivePriority = 'high';

      // Weight multiplier based on waiting time beyond threshold
      const agingMultiplier = 1 + round2(Math.min(2.0, (waitMinutes - agingWaitThresholdMinutes) * 0.1));
      baseWeight = round2(baseWeight * agingMultiplier);
    }

    const rawGuarantee = minimumGuarantees[effectivePriority] || minimumGuarantees[r.priority] || 0;
    // Guaranteed amount cannot exceed the request's desired amount
    const targetGuarantee = round2(Math.min(r.desiredMbps, rawGuarantee));

    return {
      ...r,
      effectivePriority,
      effectiveWeight: baseWeight,
      targetGuarantee,
      allocated: 0,
      aged,
      waitMinutes,
    };
  });

  let remainingCapacity = usableCapacity;

  // 2. Step 1: Minimum bandwidth guarantees allocation
  const totalTargetGuarantees = round2(state.reduce((sum, item) => sum + item.targetGuarantee, 0));

  if (totalTargetGuarantees > 0) {
    if (totalTargetGuarantees <= remainingCapacity) {
      // All minimum guarantees are feasible
      for (const item of state) {
        item.allocated = item.targetGuarantee;
        remainingCapacity = round2(remainingCapacity - item.targetGuarantee);
      }
    } else {
      // Infeasible guarantees: Deterministic scaling
      // Scale guarantees proportionally by (remainingCapacity / totalTargetGuarantees)
      const scaleFactor = remainingCapacity / totalTargetGuarantees;
      for (const item of state) {
        const scaled = round2(item.targetGuarantee * scaleFactor);
        item.allocated = Math.min(scaled, item.desiredMbps);
        remainingCapacity = round2(remainingCapacity - item.allocated);
      }
    }
  }

  // 3. Step 2: Iterative water-filling weighted distribution for remaining capacity
  let activeItems = state.filter((item) => round2(item.allocated) < round2(item.desiredMbps));

  while (remainingCapacity > 0.01 && activeItems.length > 0) {
    const totalActiveWeight = round2(activeItems.reduce((sum, item) => sum + item.effectiveWeight, 0));
    if (totalActiveWeight <= 0) break;

    let capacityAllocatedInRound = 0;
    const newlyCapped = [];
    const poolForRound = remainingCapacity;

    for (let i = 0; i < activeItems.length; i++) {
      const item = activeItems[i];
      if (remainingCapacity <= 0) break;

      const shareRatio = item.effectiveWeight / totalActiveWeight;
      // Proportional grant, capped strictly by pool and current remaining capacity
      let proposedGrant = round2(poolForRound * shareRatio);
      if (proposedGrant > remainingCapacity) {
        proposedGrant = remainingCapacity;
      }

      const unmet = round2(item.desiredMbps - item.allocated);
      const grant = round2(Math.min(unmet, proposedGrant, remainingCapacity));

      if (grant > 0) {
        item.allocated = round2(item.allocated + grant);
        capacityAllocatedInRound = round2(capacityAllocatedInRound + grant);
        remainingCapacity = round2(Math.max(0, remainingCapacity - grant));
      }

      if (round2(item.allocated) >= round2(item.desiredMbps)) {
        newlyCapped.push(item);
      }
    }

    // If no progress made in this round, break
    if (capacityAllocatedInRound <= 0.001) {
      break;
    }

    // Filter out requests that reached their desired cap so unused share redistributes
    activeItems = activeItems.filter((item) => !newlyCapped.includes(item));
  }

  // 4. Invariant safety clamp & format output
  // Ensure sum of allocations strictly <= usableCapacity
  let sumAllocated = round2(state.reduce((s, it) => s + it.allocated, 0));
  if (sumAllocated > usableCapacity) {
    let excess = round2(sumAllocated - usableCapacity);
    // Deduct excess from the lowest priority/last allocated item
    for (let i = state.length - 1; i >= 0 && excess > 0; i--) {
      const deduct = Math.min(state[i].allocated, excess);
      state[i].allocated = round2(state[i].allocated - deduct);
      excess = round2(excess - deduct);
    }
  }
  let totalAllocated = 0;
  const allocations = state.map((item) => {
    // Strictly enforce ceiling at desiredMbps
    let finalAlloc = round2(Math.min(item.desiredMbps, Math.max(0, item.allocated)));
    const unmet = round2(Math.max(0, item.desiredMbps - finalAlloc));
    totalAllocated = round2(totalAllocated + finalAlloc);

    let status = 'approved';
    let explanation = `Adaptive: Fully allocated (${finalAlloc} Mbps).`;
    if (item.targetGuarantee > 0) {
      explanation += ` Met min guarantee of ${item.targetGuarantee} Mbps.`;
    }
    if (item.aged) {
      explanation += ` Boosted by waiting aging (+${item.waitMinutes}m).`;
    }

    if (unmet > 0) {
      if (finalAlloc > 0) {
        status = 'partially_allocated';
        explanation = `Adaptive: Partially allocated (${finalAlloc} Mbps of ${item.desiredMbps} Mbps) based on weight ${item.effectiveWeight}.`;
      } else {
        status = 'rejected';
        explanation = `Adaptive: Capacity exhausted under weight ${item.effectiveWeight}.`;
      }
    }

    return {
      id: item.id,
      userId: item.userId,
      userName: item.userName,
      desiredMbps: item.desiredMbps,
      allocatedMbps: finalAlloc,
      unmetMbps: unmet,
      priority: item.priority,
      effectivePriority: item.effectivePriority,
      effectiveWeight: item.effectiveWeight,
      status,
      explanation,
    };
  });

  const finalRemaining = round2(Math.max(0, usableCapacity - totalAllocated));
  const totalRequested = round2(eligibleRequests.reduce((sum, r) => sum + r.desiredMbps, 0));
  const unmetDemand = round2(Math.max(0, totalRequested - totalAllocated));

  return {
    policy: 'ADAPTIVE',
    totalCapacityMbps: round2(totalCapacityMbps),
    reservedBandwidthMbps: round2(reservedBandwidthMbps),
    usableCapacityMbps: usableCapacity,
    totalAllocatedMbps: round2(totalAllocated),
    remainingCapacityMbps: finalRemaining,
    totalRequestedMbps: totalRequested,
    unmetDemandMbps: unmetDemand,
    requests: allocations,
  };
};

/**
 * Main allocation runner orchestrating policy selection
 */
export const runAllocation = ({
  policy = 'ADAPTIVE',
  totalCapacityMbps,
  reservedBandwidthMbps = 0,
  requests = [],
  policyWeights = DEFAULT_WEIGHTS,
  minimumGuarantees = DEFAULT_GUARANTEES,
  enableAging = true,
  agingWaitThresholdMinutes = 5,
}) => {
  validateAllocationInput({
    totalCapacityMbps,
    reservedBandwidthMbps,
    requests,
    policyWeights,
    minimumGuarantees,
  });

  switch (policy.toUpperCase()) {
    case 'FCFS':
      return runFCFS({ totalCapacityMbps, reservedBandwidthMbps, requests });
    case 'PRIORITY':
      return runPriorityBased({ totalCapacityMbps, reservedBandwidthMbps, requests });
    case 'ADAPTIVE':
    default:
      return runAdaptive({
        totalCapacityMbps,
        reservedBandwidthMbps,
        requests,
        policyWeights,
        minimumGuarantees,
        enableAging,
        agingWaitThresholdMinutes,
      });
  }
};
