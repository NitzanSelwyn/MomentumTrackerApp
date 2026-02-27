import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";

async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Authentication required");
  }
  return identity;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await requireAuth(ctx);
  const worker = await ctx.db
    .query("workers")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!worker || worker.role !== "admin") {
    throw new ConvexError("Admin access required");
  }
  return { identity, worker };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getFloorPlans = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const worker = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!worker || !worker.organizationId) return [];

    const plans = await ctx.db
      .query("floorPlans")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", worker.organizationId as Id<"organizations">)
      )
      .collect();

    return plans.map((p) => ({
      _id: p._id,
      _creationTime: p._creationTime,
      name: p.name,
      isActive: p.isActive,
      imageWidth: p.imageWidth,
      imageHeight: p.imageHeight,
      calibrationPoints: p.calibrationPoints,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  },
});

export const getActiveFloorPlan = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const worker = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!worker || !worker.organizationId) return null;

    const plan = await ctx.db
      .query("floorPlans")
      .withIndex("by_organizationId_active", (q) =>
        q
          .eq("organizationId", worker.organizationId as Id<"organizations">)
          .eq("isActive", true)
      )
      .unique();

    if (!plan) return null;

    const imageUrl = await ctx.storage.getUrl(plan.imageStorageId);
    if (!imageUrl) return null;

    const zones = await ctx.db
      .query("floorZones")
      .withIndex("by_floorPlanId", (q) => q.eq("floorPlanId", plan._id))
      .collect();

    return {
      _id: plan._id,
      name: plan.name,
      imageUrl,
      imageWidth: plan.imageWidth,
      imageHeight: plan.imageHeight,
      calibrationPoints: plan.calibrationPoints,
      isActive: plan.isActive,
      zones: zones.map((z) => ({
        _id: z._id,
        name: z.name,
        color: z.color,
        points: z.points,
      })),
    };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const generateFloorPlanUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const { worker } = await requireAdmin(ctx);
    if (!worker.organizationId) {
      throw new ConvexError("No organization found");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const createFloorPlan = mutation({
  args: {
    name: v.string(),
    imageStorageId: v.id("_storage"),
    imageWidth: v.number(),
    imageHeight: v.number(),
  },
  returns: v.id("floorPlans"),
  handler: async (ctx, args) => {
    const { worker } = await requireAdmin(ctx);
    if (!worker.organizationId) {
      throw new ConvexError("No organization found");
    }

    return await ctx.db.insert("floorPlans", {
      organizationId: worker.organizationId as Id<"organizations">,
      name: args.name,
      imageStorageId: args.imageStorageId,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
      calibrationPoints: [],
      isActive: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateFloorPlanCalibration = mutation({
  args: {
    floorPlanId: v.id("floorPlans"),
    calibrationPoints: v.array(
      v.object({
        px: v.number(),
        py: v.number(),
        lat: v.number(),
        lng: v.number(),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const plan = await ctx.db.get(args.floorPlanId);
    if (!plan) throw new ConvexError("Floor plan not found");

    await ctx.db.patch(args.floorPlanId, {
      calibrationPoints: args.calibrationPoints,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setActiveFloorPlan = mutation({
  args: { floorPlanId: v.id("floorPlans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { worker } = await requireAdmin(ctx);
    if (!worker.organizationId) {
      throw new ConvexError("No organization found");
    }

    // Deactivate all plans for this org
    const allPlans = await ctx.db
      .query("floorPlans")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", worker.organizationId as Id<"organizations">)
      )
      .collect();

    await Promise.all(
      allPlans.map((p) =>
        ctx.db.patch(p._id, { isActive: false, updatedAt: Date.now() })
      )
    );

    // Activate the target plan
    await ctx.db.patch(args.floorPlanId, {
      isActive: true,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deactivateFloorPlan = mutation({
  args: { floorPlanId: v.id("floorPlans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.floorPlanId, {
      isActive: false,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteFloorPlan = mutation({
  args: { floorPlanId: v.id("floorPlans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const plan = await ctx.db.get(args.floorPlanId);
    if (!plan) throw new ConvexError("Floor plan not found");

    // Delete all zones
    const zones = await ctx.db
      .query("floorZones")
      .withIndex("by_floorPlanId", (q) => q.eq("floorPlanId", args.floorPlanId))
      .collect();
    await Promise.all(zones.map((z) => ctx.db.delete(z._id)));

    // Delete all markers
    const markers = await ctx.db
      .query("floorMarkers")
      .withIndex("by_floorPlanId", (q) => q.eq("floorPlanId", args.floorPlanId))
      .collect();
    await Promise.all(markers.map((m) => ctx.db.delete(m._id)));

    // Delete storage file
    await ctx.storage.delete(plan.imageStorageId);

    // Delete the plan record
    await ctx.db.delete(args.floorPlanId);
    return null;
  },
});

export const createFloorZone = mutation({
  args: {
    floorPlanId: v.id("floorPlans"),
    name: v.string(),
    color: v.string(),
    points: v.array(v.object({ x: v.number(), y: v.number() })),
  },
  returns: v.id("floorZones"),
  handler: async (ctx, args) => {
    const { worker } = await requireAdmin(ctx);
    if (!worker.organizationId) {
      throw new ConvexError("No organization found");
    }

    const plan = await ctx.db.get(args.floorPlanId);
    if (!plan) throw new ConvexError("Floor plan not found");

    return await ctx.db.insert("floorZones", {
      floorPlanId: args.floorPlanId,
      organizationId: worker.organizationId as Id<"organizations">,
      name: args.name,
      color: args.color,
      points: args.points,
      createdAt: Date.now(),
    });
  },
});

export const updateFloorZone = mutation({
  args: {
    zoneId: v.id("floorZones"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    points: v.optional(
      v.array(v.object({ x: v.number(), y: v.number() }))
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { zoneId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.color !== undefined) patch.color = updates.color;
    if (updates.points !== undefined) patch.points = updates.points;
    await ctx.db.patch(zoneId, patch);
    return null;
  },
});

export const deleteFloorZone = mutation({
  args: { zoneId: v.id("floorZones") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.zoneId);
    return null;
  },
});

// ─── Markers ─────────────────────────────────────────────────────────────────

export const getFloorMarkers = query({
  args: { floorPlanId: v.id("floorPlans") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("floorMarkers")
      .withIndex("by_floorPlanId", (q) => q.eq("floorPlanId", args.floorPlanId))
      .collect();
  },
});

export const createFloorMarker = mutation({
  args: {
    floorPlanId: v.id("floorPlans"),
    name: v.string(),
    icon: v.optional(v.string()),
    x: v.number(),
    y: v.number(),
  },
  returns: v.id("floorMarkers"),
  handler: async (ctx, args) => {
    const { worker } = await requireAdmin(ctx);
    if (!worker.organizationId) throw new ConvexError("No organization found");
    return await ctx.db.insert("floorMarkers", {
      floorPlanId: args.floorPlanId,
      organizationId: worker.organizationId as Id<"organizations">,
      name: args.name,
      icon: args.icon,
      x: args.x,
      y: args.y,
      createdAt: Date.now(),
    });
  },
});

export const updateFloorMarker = mutation({
  args: {
    markerId: v.id("floorMarkers"),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { markerId, ...rest } = args;
    const patch: Record<string, unknown> = {};
    if (rest.name !== undefined) patch.name = rest.name;
    if (rest.icon !== undefined) patch.icon = rest.icon;
    await ctx.db.patch(markerId, patch);
    return null;
  },
});

export const deleteFloorMarker = mutation({
  args: { markerId: v.id("floorMarkers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.markerId);
    return null;
  },
});
