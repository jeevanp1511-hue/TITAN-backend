import { describe, it, expect } from 'vitest';
import {
  runAllocation,
  runFCFS,
  runPriorityBased,
  runAdaptive,
  validateAllocationInput,
} from '../src/services/allocationEngine.js';

describe('TITAN Allocation Engine', () => {
  // 1. Acceptance Scenario from Problem Statement
  describe('Acceptance Scenario (PS-32 Benchmark)', () => {
    const scenario = {
      totalCapacityMbps: 100,
      reservedBandwidthMbps: 10,
      requests: [
        { id: 'req_a', userName: 'User A', desiredMbps: 40, priority: 'high', createdAt: new Date('2026-01-01T10:00:00Z') },
        { id: 'req_b', userName: 'User B', desiredMbps: 30, priority: 'medium', createdAt: new Date('2026-01-01T10:01:00Z') },
        { id: 'req_c', userName: 'User C', desiredMbps: 50, priority: 'low', createdAt: new Date('2026-01-01T10:02:00Z') },
      ],
    };

    it('should correctly allocate bandwidth under Priority-Based policy according to benchmark', () => {
      const result = runAllocation({ ...scenario, policy: 'PRIORITY' });

      expect(result.usableCapacityMbps).toBe(90);
      expect(result.totalAllocatedMbps).toBe(90);
      expect(result.remainingCapacityMbps).toBe(0);
      expect(result.unmetDemandMbps).toBe(30);

      const userA = result.requests.find((r) => r.id === 'req_a');
      const userB = result.requests.find((r) => r.id === 'req_b');
      const userC = result.requests.find((r) => r.id === 'req_c');

      expect(userA.allocatedMbps).toBe(40);
      expect(userA.status).toBe('approved');
      expect(userA.unmetMbps).toBe(0);

      expect(userB.allocatedMbps).toBe(30);
      expect(userB.status).toBe('approved');
      expect(userB.unmetMbps).toBe(0);

      expect(userC.allocatedMbps).toBe(20);
      expect(userC.status).toBe('partially_allocated');
      expect(userC.unmetMbps).toBe(30);
    });

    it('should correctly allocate bandwidth under FCFS order', () => {
      const result = runAllocation({ ...scenario, policy: 'FCFS' });

      // User A (40) -> 50 left
      // User B (30) -> 20 left
      // User C (50) -> gets remaining 20, 30 unmet
      expect(result.usableCapacityMbps).toBe(90);
      expect(result.totalAllocatedMbps).toBe(90);
      expect(result.remainingCapacityMbps).toBe(0);

      const userA = result.requests.find((r) => r.id === 'req_a');
      const userB = result.requests.find((r) => r.id === 'req_b');
      const userC = result.requests.find((r) => r.id === 'req_c');

      expect(userA.allocatedMbps).toBe(40);
      expect(userB.allocatedMbps).toBe(30);
      expect(userC.allocatedMbps).toBe(20);
    });
  });

  // 2. Strict Invariants
  describe('Strict Capacity & Allocation Invariants', () => {
    it('invariant 1 & 2: allocations must be finite, non-negative, and <= desiredMbps', () => {
      const result = runAllocation({
        totalCapacityMbps: 50,
        reservedBandwidthMbps: 5,
        policy: 'ADAPTIVE',
        requests: [
          { id: '1', desiredMbps: 15, priority: 'high' },
          { id: '2', desiredMbps: 25, priority: 'medium' },
          { id: '3', desiredMbps: 35, priority: 'low' },
        ],
      });

      for (const r of result.requests) {
        expect(r.allocatedMbps).toBeGreaterThanOrEqual(0);
        expect(r.allocatedMbps).toBeLessThanOrEqual(r.desiredMbps);
        expect(Number.isFinite(r.allocatedMbps)).toBe(true);
      }
    });

    it('invariant 3 & 4: total allocations must NEVER exceed usable capacity (total - reserved)', () => {
      const result = runAllocation({
        totalCapacityMbps: 60,
        reservedBandwidthMbps: 20,
        policy: 'ADAPTIVE',
        requests: [
          { id: '1', desiredMbps: 100, priority: 'high' },
          { id: '2', desiredMbps: 100, priority: 'medium' },
        ],
      });

      expect(result.usableCapacityMbps).toBe(40);
      expect(result.totalAllocatedMbps).toBeLessThanOrEqual(40);
      expect(result.remainingCapacityMbps).toBeGreaterThanOrEqual(0);
    });

    it('invariant 5: re-running with identical inputs produces identical results (determinism)', () => {
      const payload = {
        totalCapacityMbps: 80,
        reservedBandwidthMbps: 10,
        policy: 'ADAPTIVE',
        requests: [
          { id: '1', desiredMbps: 20, priority: 'high', createdAt: new Date('2026-01-01T10:00:00Z') },
          { id: '2', desiredMbps: 45, priority: 'low', createdAt: new Date('2026-01-01T10:05:00Z') },
        ],
      };

      const run1 = runAllocation(payload);
      const run2 = runAllocation(payload);

      expect(run1).toEqual(run2);
    });

    it('invariant 6: invalid numeric inputs must be rejected with descriptive errors', () => {
      expect(() =>
        validateAllocationInput({
          totalCapacityMbps: -50,
          reservedBandwidthMbps: 10,
        })
      ).toThrow('Total capacity must be a non-negative number');

      expect(() =>
        validateAllocationInput({
          totalCapacityMbps: 50,
          reservedBandwidthMbps: 60,
        })
      ).toThrow('Reserved bandwidth cannot exceed total network capacity');

      expect(() =>
        validateAllocationInput({
          totalCapacityMbps: 50,
          reservedBandwidthMbps: 10,
          requests: [{ id: '1', desiredMbps: -5 }],
        })
      ).toThrow('desiredMbps > 0');
    });

    it('invariant 7: cancelled and rejected requests are excluded from calculations', () => {
      const result = runAllocation({
        totalCapacityMbps: 50,
        reservedBandwidthMbps: 0,
        policy: 'FCFS',
        requests: [
          { id: '1', desiredMbps: 20, status: 'cancelled' },
          { id: '2', desiredMbps: 15, status: 'approved' },
        ],
      });

      expect(result.requests.length).toBe(1);
      expect(result.requests[0].id).toBe('2');
      expect(result.totalAllocatedMbps).toBe(15);
    });
  });

  // 3. Adaptive Policy, Water-Filling & Aging
  describe('Adaptive Fair Sharing & Starvation Mitigation', () => {
    it('should satisfy minimum guarantees first', () => {
      const result = runAdaptive({
        totalCapacityMbps: 50,
        reservedBandwidthMbps: 10, // 40 usable
        minimumGuarantees: { high: 15, medium: 10, low: 0 },
        requests: [
          { id: '1', desiredMbps: 25, priority: 'high' },
          { id: '2', desiredMbps: 20, priority: 'medium' },
        ],
      });

      const high = result.requests.find((r) => r.id === '1');
      const med = result.requests.find((r) => r.id === '2');

      expect(high.allocatedMbps).toBeGreaterThanOrEqual(15);
      expect(med.allocatedMbps).toBeGreaterThanOrEqual(10);
      expect(result.totalAllocatedMbps).toBeLessThanOrEqual(40);
    });

    it('should deterministically scale infeasible minimum guarantees when guarantees exceed usable capacity', () => {
      const result = runAdaptive({
        totalCapacityMbps: 20,
        reservedBandwidthMbps: 5, // 15 usable
        minimumGuarantees: { high: 20, medium: 10, low: 0 },
        requests: [
          { id: '1', desiredMbps: 20, priority: 'high' },
          { id: '2', desiredMbps: 10, priority: 'medium' },
        ],
      });

      // Total guarantees requested = 30, but only 15 usable
      expect(result.totalAllocatedMbps).toBeLessThanOrEqual(15);
      expect(result.totalAllocatedMbps).toBe(15);
    });

    it('should redistribute excess share when a request reaches its desired cap', () => {
      // 100 usable, weights high: 5, low: 1
      // User A (high) only needs 10 Mbps.
      // Excess share should flow to User B (low) instead of being lost.
      const result = runAdaptive({
        totalCapacityMbps: 100,
        reservedBandwidthMbps: 0,
        policyWeights: { high: 5, medium: 3, low: 1 },
        minimumGuarantees: { high: 0, medium: 0, low: 0 },
        requests: [
          { id: 'A', desiredMbps: 10, priority: 'high' },
          { id: 'B', desiredMbps: 90, priority: 'low' },
        ],
      });

      const userA = result.requests.find((r) => r.id === 'A');
      const userB = result.requests.find((r) => r.id === 'B');

      expect(userA.allocatedMbps).toBe(10);
      expect(userB.allocatedMbps).toBe(90);
      expect(result.totalAllocatedMbps).toBe(100);
    });

    it('should mitigate starvation through waiting-time aging', () => {
      const now = Date.now();
      const result = runAdaptive({
        totalCapacityMbps: 40,
        reservedBandwidthMbps: 0,
        enableAging: true,
        agingWaitThresholdMinutes: 5,
        policyWeights: { high: 5, medium: 3, low: 1 },
        minimumGuarantees: { high: 0, medium: 0, low: 0 },
        requests: [
          // Low priority waiting for 15 minutes
          { id: 'old_low', desiredMbps: 30, priority: 'low', waitMinutes: 15 },
          // High priority just arrived
          { id: 'new_high', desiredMbps: 30, priority: 'high', waitMinutes: 0 },
        ],
      });

      const oldLow = result.requests.find((r) => r.id === 'old_low');
      expect(oldLow.effectivePriority).toBe('medium'); // Promoted from low to medium
      expect(oldLow.effectiveWeight).toBeGreaterThan(1); // Scaled weight due to aging
      expect(oldLow.allocatedMbps).toBeGreaterThan(0);
    });
  });

  // 4. Edge Cases
  describe('Edge Cases', () => {
    it('should handle zero usable capacity gracefully', () => {
      const result = runAllocation({
        totalCapacityMbps: 50,
        reservedBandwidthMbps: 50,
        requests: [{ id: '1', desiredMbps: 20, priority: 'high' }],
      });

      expect(result.usableCapacityMbps).toBe(0);
      expect(result.totalAllocatedMbps).toBe(0);
      expect(result.requests[0].allocatedMbps).toBe(0);
      expect(result.requests[0].status).toBe('rejected');
    });

    it('should handle empty requests array without error', () => {
      const result = runAllocation({
        totalCapacityMbps: 100,
        reservedBandwidthMbps: 10,
        requests: [],
      });

      expect(result.usableCapacityMbps).toBe(90);
      expect(result.totalAllocatedMbps).toBe(0);
      expect(result.requests).toEqual([]);
    });
  });
});
