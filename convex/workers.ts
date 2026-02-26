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

export const ensureWorker = mutation({
  args: {
    role: v.optional(v.union(v.literal("worker"), v.literal("admin"))),
  },
  returns: v.id("workers"),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const clerkId = identity.subject;

    const existing = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: identity.name ?? existing.name,
        email: identity.email ?? existing.email,
        lastSeen: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("workers", {
      clerkId,
      email: identity.email ?? "",
      name: identity.name ?? "Unknown",
      role: args.role ?? "admin",
      isOnDuty: false,
      createdAt: Date.now(),
      lastSeen: Date.now(),
    });
  },
});

export const listWorkers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("workers"),
      _creationTime: v.number(),
      clerkId: v.string(),
      email: v.string(),
      name: v.string(),
      role: v.union(v.literal("worker"), v.literal("admin")),
      organizationId: v.optional(v.string()),
      avatarStorageId: v.optional(v.id("_storage")),
      avatarUrl: v.optional(v.string()),
      isOnDuty: v.boolean(),
      lastSeen: v.optional(v.number()),
      createdAt: v.number(),
      currentLocation: v.optional(
        v.object({
          latitude: v.number(),
          longitude: v.number(),
          batteryLevel: v.optional(v.number()),
          isCharging: v.optional(v.boolean()),
          timestamp: v.number(),
        })
      ),
    })
  ),
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);

    // Look up the caller's worker record
    const caller = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    let workers = await ctx.db.query("workers").collect();

    // Filter by caller's org if they have one
    if (caller?.organizationId) {
      workers = workers.filter(
        (w) => w.organizationId === caller.organizationId
      );
    }

    const workersWithLocations = await Promise.all(
      workers.map(async (worker) => {
        const location = await ctx.db
          .query("currentWorkerLocations")
          .withIndex("by_workerId", (q) => q.eq("workerId", worker._id))
          .unique();

        const avatarUrl = worker.avatarStorageId
          ? await ctx.storage.getUrl(worker.avatarStorageId)
          : undefined;

        return {
          ...worker,
          avatarUrl: avatarUrl ?? undefined,
          currentLocation: location
            ? {
                latitude: location.latitude,
                longitude: location.longitude,
                batteryLevel: location.batteryLevel,
                isCharging: location.isCharging,
                timestamp: location.timestamp,
              }
            : undefined,
        };
      })
    );

    return workersWithLocations;
  },
});

export const getWorker = query({
  args: { workerId: v.id("workers") },
  returns: v.union(
    v.object({
      _id: v.id("workers"),
      _creationTime: v.number(),
      clerkId: v.string(),
      email: v.string(),
      name: v.string(),
      role: v.union(v.literal("worker"), v.literal("admin")),
      organizationId: v.optional(v.string()),
      avatarStorageId: v.optional(v.id("_storage")),
      avatarUrl: v.optional(v.string()),
      isOnDuty: v.boolean(),
      lastSeen: v.optional(v.number()),
      createdAt: v.number(),
      currentLocation: v.optional(
        v.object({
          latitude: v.number(),
          longitude: v.number(),
          accuracy: v.optional(v.number()),
          batteryLevel: v.optional(v.number()),
          isCharging: v.optional(v.boolean()),
          timestamp: v.number(),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const worker = await ctx.db.get(args.workerId);
    if (!worker) return null;

    const location = await ctx.db
      .query("currentWorkerLocations")
      .withIndex("by_workerId", (q) => q.eq("workerId", worker._id))
      .unique();

    const avatarUrl = worker.avatarStorageId
      ? await ctx.storage.getUrl(worker.avatarStorageId)
      : undefined;

    return {
      ...worker,
      avatarUrl: avatarUrl ?? undefined,
      currentLocation: location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            batteryLevel: location.batteryLevel,
            isCharging: location.isCharging,
            timestamp: location.timestamp,
          }
        : undefined,
    };
  },
});

export const createWorker = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("worker"), v.literal("admin")),
  },
  returns: v.id("workers"),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    // Verify caller is admin
    const caller = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!caller || caller.role !== "admin") {
      throw new ConvexError("Only admins can create workers");
    }

    return await ctx.db.insert("workers", {
      clerkId: `manual_${Date.now()}`,
      email: args.email,
      name: args.name,
      role: args.role,
      isOnDuty: false,
      createdAt: Date.now(),
    });
  },
});

export const updateWorkerName = mutation({
  args: {
    workerId: v.id("workers"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);

    const caller = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!caller) {
      throw new ConvexError("Caller not found");
    }

    // Allow if caller is admin or is updating own name
    if (caller.role !== "admin" && caller._id !== args.workerId) {
      throw new ConvexError("Not authorized to update this worker's name");
    }

    await ctx.db.patch(args.workerId, { name: args.name });
    return null;
  },
});

export const setDutyStatus = mutation({
  args: {
    workerId: v.id("workers"),
    isOnDuty: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.patch(args.workerId, { isOnDuty: args.isOnDuty });
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    const caller = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller.role !== "admin") {
      throw new ConvexError("Only admins can upload files");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateWorkerAvatar = mutation({
  args: {
    workerId: v.id("workers"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const caller = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller.role !== "admin") {
      throw new ConvexError("Only admins can update avatars");
    }

    const worker = await ctx.db.get(args.workerId);
    if (!worker) throw new ConvexError("Worker not found");

    // Delete old avatar from storage if exists
    if (worker.avatarStorageId) {
      await ctx.storage.delete(worker.avatarStorageId);
    }

    await ctx.db.patch(args.workerId, { avatarStorageId: args.storageId });
    return null;
  },
});
