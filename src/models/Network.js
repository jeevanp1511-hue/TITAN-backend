import mongoose from 'mongoose';
import crypto from 'crypto';

const networkSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Network name is required'],
      trim: true,
      minlength: [3, 'Network name must be at least 3 characters'],
      maxlength: [80, 'Network name cannot exceed 80 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, 'Description cannot exceed 300 characters'],
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    totalCapacityMbps: {
      type: Number,
      required: [true, 'Total capacity is required'],
      min: [1, 'Total capacity must be at least 1 Mbps'],
    },
    reservedBandwidthMbps: {
      type: Number,
      required: [true, 'Reserved bandwidth is required'],
      min: [0, 'Reserved bandwidth cannot be negative'],
      default: 0,
      validate: {
        validator: function (val) {
          return val <= this.totalCapacityMbps;
        },
        message: 'Reserved bandwidth cannot exceed total capacity',
      },
    },
    allocationPolicy: {
      type: String,
      enum: ['FCFS', 'PRIORITY', 'ADAPTIVE'],
      default: 'ADAPTIVE',
      required: true,
    },
    priorityWeights: {
      high: { type: Number, default: 5, min: 1 },
      medium: { type: Number, default: 3, min: 1 },
      low: { type: Number, default: 1, min: 1 },
    },
    minimumGuarantees: {
      high: { type: Number, default: 10, min: 0 },
      medium: { type: Number, default: 5, min: 0 },
      low: { type: Number, default: 0, min: 0 },
    },
    enableAging: {
      type: Boolean,
      default: true,
    },
    agingWaitThresholdMinutes: {
      type: Number,
      default: 5,
      min: 1,
    },
    invitationCode: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      required: true,
      default: () => crypto.randomBytes(4).toString('hex').toUpperCase(),
    },
    isRequestsPaused: {
      type: Boolean,
      default: false,
    },
    activeAllocationRun: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AllocationRun',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

networkSchema.virtual('usableCapacityMbps').get(function () {
  return Math.max(0, this.totalCapacityMbps - this.reservedBandwidthMbps);
});

export const Network = mongoose.model('Network', networkSchema);
