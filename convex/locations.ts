import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";

async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Authentication required");
  }
  return identity;
}

export const updateLocation = mutation({
  args: {
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.optional(v.number()),
    batteryLevel: v.optional(v.number()),
    isCharging: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const worker = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!worker) {
      throw new ConvexError("Worker not found");
    }

    const now = Date.now();

    // Update or insert current location
    const existing = await ctx.db
      .query("currentWorkerLocations")
      .withIndex("by_workerId", (q) => q.eq("workerId", worker._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        latitude: args.latitude,
        longitude: args.longitude,
        accuracy: args.accuracy,
        batteryLevel: args.batteryLevel,
        isCharging: args.isCharging,
        timestamp: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("currentWorkerLocations", {
        workerId: worker._id,
        latitude: args.latitude,
        longitude: args.longitude,
        accuracy: args.accuracy,
        batteryLevel: args.batteryLevel,
        isCharging: args.isCharging,
        timestamp: now,
        updatedAt: now,
      });
    }

    // Update worker lastSeen
    await ctx.db.patch(worker._id, { lastSeen: now });

    return null;
  },
});

export const getCurrentLocations = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("currentWorkerLocations"),
      _creationTime: v.number(),
      workerId: v.id("workers"),
      latitude: v.number(),
      longitude: v.number(),
      accuracy: v.optional(v.number()),
      batteryLevel: v.optional(v.number()),
      isCharging: v.optional(v.boolean()),
      timestamp: v.number(),
      updatedAt: v.number(),
      workerName: v.string(),
      workerRole: v.union(v.literal("worker"), v.literal("admin")),
      isOnDuty: v.boolean(),
    })
  ),
  handler: async (ctx) => {
    await requireAuth(ctx);
    const locations = await ctx.db.query("currentWorkerLocations").collect();

    const locationsWithWorkers = await Promise.all(
      locations.map(async (loc) => {
        const worker = await ctx.db.get(loc.workerId);
        return {
          ...loc,
          workerName: worker?.name ?? "Unknown",
          workerRole: worker?.role ?? ("worker" as const),
          isOnDuty: worker?.isOnDuty ?? false,
        };
      })
    );

    return locationsWithWorkers;
  },
});

export const getWorkerHistory = query({
  args: {
    workerId: v.id("workers"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("historicalWorkerLocations"),
      _creationTime: v.number(),
      workerId: v.id("workers"),
      latitude: v.number(),
      longitude: v.number(),
      accuracy: v.optional(v.number()),
      batteryLevel: v.optional(v.number()),
      timestamp: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const q = ctx.db
      .query("historicalWorkerLocations")
      .withIndex("by_workerId_timestamp", (q) =>
        q.eq("workerId", args.workerId)
      )
      .order("desc");

    if (args.limit) {
      return await q.take(args.limit);
    }
    return await q.take(100);
  },
});

export const logHistoricalLocation = mutation({
  args: {
    workerId: v.id("workers"),
    latitude: v.number(),
    longitude: v.number(),
    accuracy: v.optional(v.number()),
    batteryLevel: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.insert("historicalWorkerLocations", {
      workerId: args.workerId,
      latitude: args.latitude,
      longitude: args.longitude,
      accuracy: args.accuracy,
      batteryLevel: args.batteryLevel,
      timestamp: Date.now(),
    });
    return null;
  },
});
