import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(60),
    email: z.string().email('Invalid email address').toLowerCase(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['admin', 'user']).optional().default('user'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').toLowerCase(),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const createNetworkSchema = z.object({
  body: z.object({
    name: z.string().min(3, 'Network name must be at least 3 characters').max(80),
    description: z.string().max(300).optional().default(''),
    totalCapacityMbps: z.number().min(1, 'Total capacity must be at least 1 Mbps'),
    reservedBandwidthMbps: z.number().min(0, 'Reserved bandwidth cannot be negative').default(0),
    allocationPolicy: z.enum(['FCFS', 'PRIORITY', 'ADAPTIVE']).default('ADAPTIVE'),
    priorityWeights: z
      .object({
        high: z.number().min(1).default(5),
        medium: z.number().min(1).default(3),
        low: z.number().min(1).default(1),
      })
      .optional(),
    minimumGuarantees: z
      .object({
        high: z.number().min(0).default(10),
        medium: z.number().min(0).default(5),
        low: z.number().min(0).default(0),
      })
      .optional(),
    enableAging: z.boolean().optional().default(true),
    agingWaitThresholdMinutes: z.number().min(1).optional().default(5),
  }).refine((data) => data.reservedBandwidthMbps <= data.totalCapacityMbps, {
    message: 'Reserved bandwidth cannot exceed total capacity',
    path: ['reservedBandwidthMbps'],
  }),
});

export const updateNetworkSchema = z.object({
  body: z.object({
    name: z.string().min(3).max(80).optional(),
    description: z.string().max(300).optional(),
    totalCapacityMbps: z.number().min(1).optional(),
    reservedBandwidthMbps: z.number().min(0).optional(),
    allocationPolicy: z.enum(['FCFS', 'PRIORITY', 'ADAPTIVE']).optional(),
    priorityWeights: z
      .object({
        high: z.number().min(1),
        medium: z.number().min(1),
        low: z.number().min(1),
      })
      .optional(),
    minimumGuarantees: z
      .object({
        high: z.number().min(0),
        medium: z.number().min(0),
        low: z.number().min(0),
      })
      .optional(),
    enableAging: z.boolean().optional(),
    agingWaitThresholdMinutes: z.number().min(1).optional(),
    isRequestsPaused: z.boolean().optional(),
  }),
});

export const joinNetworkSchema = z.object({
  body: z.object({
    invitationCode: z.string().min(4, 'Invitation code is required').trim().toUpperCase(),
  }),
});

export const createRequestSchema = z.object({
  body: z.object({
    networkId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid network ID'),
    desiredMbps: z.number().positive('Desired Mbps must be greater than 0'),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    reason: z.string().max(200).optional().default(''),
  }),
});

export const comparePoliciesSchema = z.object({
  body: z.object({
    networkId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid network ID').optional(),
    totalCapacityMbps: z.number().min(1).optional(),
    reservedBandwidthMbps: z.number().min(0).optional(),
    requests: z
      .array(
        z.object({
          id: z.string().optional(),
          userId: z.string().optional(),
          userName: z.string().optional(),
          desiredMbps: z.number().positive(),
          priority: z.enum(['high', 'medium', 'low']),
          createdAt: z.string().or(z.date()).optional(),
        })
      )
      .optional(),
  }),
});
