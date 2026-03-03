import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";

async function requireWorker(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Authentication required");
  }

  const worker = await ctx.db
    .query("workers")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!worker) {
    throw new ConvexError("Worker not found");
  }

  return { identity, worker };
}

// Combined: update current location + insert historical record (used by background task)
export const updateLocationWithHistory = mutation({
  args: {
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.optional(v.number()),
    batteryLevel: v.optional(v.number()),
    isCharging: v.optional(v.boolean()),
    heading: v.optional(v.number()),
    altitude: v.optional(v.number()),
    floor: v.optional(v.number()),
    speed: v.optional(v.number()),
    isMoving: v.optional(v.boolean()),
    locationMode: v.optional(v.union(v.literal("outdoor"), v.literal("indoor"))),
    stepCount: v.optional(v.number()),
    pressure: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { worker } = await requireWorker(ctx);
    const now = Date.now();

    // Upsert current location
    const existing = await ctx.db
      .query("currentWorkerLocations")
      .withIndex("by_workerId", (q) => q.eq("workerId", worker._id))
      .unique();

    const locationData = {
      workerId: worker._id,
      latitude: args.latitude,
      longitude: args.longitude,
      accuracy: args.accuracy,
      batteryLevel: args.batteryLevel,
      isCharging: args.isCharging,
      heading: args.heading,
      altitude: args.altitude,
      floor: args.floor,
      speed: args.speed,
      isMoving: args.isMoving,
      locationMode: args.locationMode,
      stepCount: args.stepCount,
      pressure: args.pressure,
      timestamp: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, locationData);
    } else {
      await ctx.db.insert("currentWorkerLocations", locationData);
    }

    // Throttle historical record based on org settings
    let historyIntervalMs = 10000; // default
    if (worker.organizationId) {
      const org = await ctx.db.get(
        worker.organizationId as Id<"organizations">
      );
      if (org?.historyIntervalMs) {
        historyIntervalMs = org.historyIntervalMs;
      }
    }

    const lastHistory = await ctx.db
      .query("historicalWorkerLocations")
      .withIndex("by_workerId_timestamp", (q) =>
        q.eq("workerId", worker._id)
      )
      .order("desc")
      .first();

    const shouldSaveHistory =
      !lastHistory || now - lastHistory.timestamp >= historyIntervalMs;

    if (shouldSaveHistory) {
      await ctx.db.insert("historicalWorkerLocations", {
        workerId: worker._id,
        latitude: args.latitude,
        longitude: args.longitude,
        accuracy: args.accuracy,
        batteryLevel: args.batteryLevel,
        heading: args.heading,
        altitude: args.altitude,
        floor: args.floor,
        speed: args.speed,
        isMoving: args.isMoving,
        locationMode: args.locationMode,
        stepCount: args.stepCount,
        timestamp: now,
      });
    }

    // Update lastSeen
    await ctx.db.patch(worker._id, { lastSeen: now });

    return null;
  },
});

// Toggle own duty status
export const toggleMyDuty = mutation({
  args: { isOnDuty: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { worker } = await requireWorker(ctx);
    await ctx.db.patch(worker._id, { isOnDuty: args.isOnDuty });
    return null;
  },
});

// Get own worker record with current location
export const getMyWorker = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const worker = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!worker) return null;

    const location = await ctx.db
      .query("currentWorkerLocations")
      .withIndex("by_workerId", (q) => q.eq("workerId", worker._id))
      .unique();

    return { ...worker, currentLocation: location ?? undefined };
  },
});

// Set organization on own worker record
export const setMyOrganization = mutation({
  args: { organizationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { worker } = await requireWorker(ctx);
    await ctx.db.patch(worker._id, { organizationId: args.organizationId });
    return null;
  },
});

// Update own name
export const updateMyName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { worker } = await requireWorker(ctx);
    await ctx.db.patch(worker._id, { name: args.name });
    return null;
  },
});

// Set own location mode preference
export const setLocationMode = mutation({
  args: { locationMode: v.union(v.literal("outdoor"), v.literal("indoor")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { worker } = await requireWorker(ctx);
    await ctx.db.patch(worker._id, { locationMode: args.locationMode });
    return null;
  },
});
