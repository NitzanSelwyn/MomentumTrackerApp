import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  organizations: defineTable({
    name: v.string(),
    joinCode: v.string(),
    createdBy: v.id("workers"),
    createdAt: v.number(),
    locationIntervalMs: v.optional(v.number()),
    historyIntervalMs: v.optional(v.number()),
  })
    .index("by_joinCode", ["joinCode"])
    .index("by_createdBy", ["createdBy"]),


  workers: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("worker"), v.literal("admin")),
    organizationId: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    isOnDuty: v.boolean(),
    lastSeen: v.optional(v.number()),
    createdAt: v.number(),
    locationMode: v.optional(v.union(v.literal("outdoor"), v.literal("indoor"))),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_role", ["role"])
    .index("by_organizationId", ["organizationId"]),

  currentWorkerLocations: defineTable({
    workerId: v.id("workers"),
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.optional(v.number()),
    batteryLevel: v.optional(v.number()),
    isCharging: v.optional(v.boolean()),
    timestamp: v.number(),
    updatedAt: v.number(),
    heading: v.optional(v.number()),
    altitude: v.optional(v.number()),
    floor: v.optional(v.number()),
    speed: v.optional(v.number()),
    isMoving: v.optional(v.boolean()),
    locationMode: v.optional(v.union(v.literal("outdoor"), v.literal("indoor"))),
    stepCount: v.optional(v.number()),
    pressure: v.optional(v.number()),
  }).index("by_workerId", ["workerId"]),

  historicalWorkerLocations: defineTable({
    workerId: v.id("workers"),
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.optional(v.number()),
    batteryLevel: v.optional(v.number()),
    timestamp: v.number(),
    heading: v.optional(v.number()),
    altitude: v.optional(v.number()),
    floor: v.optional(v.number()),
    speed: v.optional(v.number()),
    isMoving: v.optional(v.boolean()),
    locationMode: v.optional(v.union(v.literal("outdoor"), v.literal("indoor"))),
    stepCount: v.optional(v.number()),
  }).index("by_workerId_timestamp", ["workerId", "timestamp"]),

  mapZones: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
    points: v.array(v.object({ lat: v.number(), lng: v.number() })),
    createdAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  floorPlans: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    imageStorageId: v.id("_storage"),
    imageWidth: v.number(),
    imageHeight: v.number(),
    calibrationPoints: v.array(v.object({
      px: v.number(),
      py: v.number(),
      lat: v.number(),
      lng: v.number(),
    })),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_active", ["organizationId", "isActive"]),

  floorMarkers: defineTable({
    floorPlanId: v.id("floorPlans"),
    organizationId: v.id("organizations"),
    name: v.string(),
    icon: v.optional(v.string()),
    x: v.number(),
    y: v.number(),
    createdAt: v.number(),
  })
    .index("by_floorPlanId", ["floorPlanId"])
    .index("by_organizationId", ["organizationId"]),

  floorZones: defineTable({
    floorPlanId: v.id("floorPlans"),
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
    points: v.array(v.object({
      x: v.number(),
      y: v.number(),
    })),
    createdAt: v.number(),
  })
    .index("by_floorPlanId", ["floorPlanId"])
    .index("by_organizationId", ["organizationId"]),

  workerCommands: defineTable({
    workerId: v.id("workers"),
    fromAdminId: v.id("workers"),
    type: v.union(
      v.literal("sound_alert"),
      v.literal("message"),
      v.literal("sound_and_message")
    ),
    message: v.optional(v.string()),
    soundType: v.union(
      v.literal("alarm"),
      v.literal("notification"),
      v.literal("urgent")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("acknowledged")
    ),
    createdAt: v.number(),
    deliveredAt: v.optional(v.number()),
    acknowledgedAt: v.optional(v.number()),
  })
    .index("by_workerId", ["workerId"])
    .index("by_workerId_status", ["workerId", "status"]),

  taskTemplates: defineTable({
    organizationId: v.id("organizations"),
    title: v.string(),
    description: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    category: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  taskAssignments: defineTable({
    organizationId: v.id("organizations"),
    workerId: v.id("workers"),
    assignedDate: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    taskTemplateId: v.optional(v.id("taskTemplates")),
    recurringRuleId: v.optional(v.id("recurringTaskRules")),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("skipped"),
    ),
    completedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workerId_date", ["workerId", "assignedDate"])
    .index("by_organizationId_date", ["organizationId", "assignedDate"]),

  recurringTaskRules: defineTable({
    organizationId: v.id("organizations"),
    workerIds: v.array(v.id("workers")),
    title: v.string(),
    description: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    taskTemplateId: v.optional(v.id("taskTemplates")),
    recurrenceType: v.union(
      v.literal("daily"),
      v.literal("weekdays"),
      v.literal("weekly"),
      v.literal("custom"),
    ),
    weekdays: v.optional(v.array(v.number())),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),
});
