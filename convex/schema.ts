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
  }).index("by_workerId", ["workerId"]),

  historicalWorkerLocations: defineTable({
    workerId: v.id("workers"),
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.optional(v.number()),
    batteryLevel: v.optional(v.number()),
    timestamp: v.number(),
  }).index("by_workerId_timestamp", ["workerId", "timestamp"]),

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
});
