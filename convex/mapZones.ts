import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";

async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Authentication required");
  return identity;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await requireAuth(ctx);
  const worker = await ctx.db
    .query("workers")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!worker || worker.role !== "admin") throw new ConvexError("Admin access required");
  return { identity, worker };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getMapZones = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const worker = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!worker?.organizationId) return [];

    return await ctx.db
      .query("mapZones")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", worker.organizationId as Id<"organizations">)
      )
      .collect();
  },
});

/**
 * Returns each zone with the list of workers currently inside it.
 * Uses ray-casting point-in-polygon on live GPS locations.
 */
export const getWorkerZoneStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller?.organizationId) return [];

    const zones = await ctx.db
      .query("mapZones")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", caller.organizationId as Id<"organizations">)
      )
      .collect();

    const workers = await ctx.db
      .query("workers")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", caller.organizationId as string)
      )
      .collect();

    const workerLocations = await Promise.all(
      workers.map(async (w) => {
        const loc = await ctx.db
          .query("currentWorkerLocations")
          .withIndex("by_workerId", (q) => q.eq("workerId", w._id))
          .unique();
        return { worker: w, loc };
      })
    );

    return zones.map((zone) => {
      const inside = workerLocations
        .filter(({ loc }) => loc && pointInPolygon(loc.latitude, loc.longitude, zone.points))
        .map(({ worker }) => ({ _id: worker._id, name: worker.name, isOnDuty: worker.isOnDuty }));

      return {
        _id: zone._id,
        name: zone.name,
        color: zone.color,
        workerCount: inside.length,
        workers: inside,
      };
    });
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createMapZone = mutation({
  args: {
    name: v.string(),
    color: v.string(),
    points: v.array(v.object({ lat: v.number(), lng: v.number() })),
  },
  returns: v.id("mapZones"),
  handler: async (ctx, args) => {
    const { worker } = await requireAdmin(ctx);
    if (!worker.organizationId) throw new ConvexError("No organization found");

    return await ctx.db.insert("mapZones", {
      organizationId: worker.organizationId as Id<"organizations">,
      name: args.name,
      color: args.color,
      points: args.points,
      createdAt: Date.now(),
    });
  },
});

export const updateMapZone = mutation({
  args: {
    zoneId: v.id("mapZones"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    points: v.optional(v.array(v.object({ lat: v.number(), lng: v.number() }))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { zoneId, ...rest } = args;
    const patch: Record<string, unknown> = {};
    if (rest.name !== undefined) patch.name = rest.name;
    if (rest.color !== undefined) patch.color = rest.color;
    if (rest.points !== undefined) patch.points = rest.points;
    await ctx.db.patch(zoneId, patch);
    return null;
  },
});

export const deleteMapZone = mutation({
  args: { zoneId: v.id("mapZones") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.zoneId);
    return null;
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Ray-casting point-in-polygon. Works for small GPS areas. */
function pointInPolygon(
  lat: number,
  lng: number,
  polygon: { lat: number; lng: number }[]
): boolean {
  let inside = false;
  const n = polygon.length;
  let j = n - 1;
  for (let i = 0; i < n; j = i++) {
    const xi = polygon[i].lng,
      yi = polygon[i].lat;
    const xj = polygon[j].lng,
      yj = polygon[j].lat;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
