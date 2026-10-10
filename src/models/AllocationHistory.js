import mongoose from 'mongoose';

const allocationHistorySchema = new mongoose.Schema(
  {
    network: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Network',
      required: true,
      index: true,
    },
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AllocationRun',
    },
    policy: {
      type: String,
      enum: ['FCFS', 'PRIORITY', 'ADAPTIVE'],
      required: true,
    },
    eventType: {
      type: String,
      enum: ['AUTO_RECALC', 'MANUAL_RUN', 'POLICY_CHANGE', 'REQUEST_CANCELLATION', 'REQUEST_SUBMISSION'],
      default: 'AUTO_RECALC',
    },
    totalAllocatedMbps: {
      type: Number,
      required: true,
    },
    usableCapacityMbps: {
      type: Number,
      required: true,
    },
    remainingCapacityMbps: {
      type: Number,
      required: true,
    },
    unmetDemandMbps: {
      type: Number,
      default: 0,
    },
    activeRequestCount: {
      type: Number,
      default: 0,
    },
    summaryNote: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

allocationHistorySchema.index({ network: 1, createdAt: -1 });

export const AllocationHistory = mongoose.model('AllocationHistory', allocationHistorySchema);
