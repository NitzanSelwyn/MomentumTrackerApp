import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";

const JOIN_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
  }
  return code;
}

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

export const createOrganization = mutation({
  args: { name: v.string() },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    const { worker } = await requireAdmin(ctx);

    if (worker.organizationId) {
      throw new ConvexError("You are already in an organization");
    }

    // Generate unique join code
    let joinCode = generateJoinCode();
    while (
      await ctx.db
        .query("organizations")
        .withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode))
        .unique()
    ) {
      joinCode = generateJoinCode();
    }

    const orgId = await ctx.db.insert("organizations", {
      name: args.name,
      joinCode,
      createdBy: worker._id,
      createdAt: Date.now(),
    });

    await ctx.db.patch(worker._id, { organizationId: orgId });

    return orgId;
  },
});

export const getMyOrganization = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const worker = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!worker || !worker.organizationId) return null;

    const org = await ctx.db.get(
      worker.organizationId as Id<"organizations">
    );
    return org;
  },
});

export const getOrganizationMembers = query({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const workers = await ctx.db
      .query("workers")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    return workers.map((w) => ({
      _id: w._id,
      name: w.name,
      email: w.email,
      role: w.role,
      isOnDuty: w.isOnDuty,
      lastSeen: w.lastSeen,
    }));
  },
});

export const getOrganizationByJoinCode = query({
  args: { joinCode: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", args.joinCode))
      .unique();

    if (!org) return null;
    return { _id: org._id, name: org.name };
  },
});

export const joinOrganization = mutation({
  args: { joinCode: v.string() },
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

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", args.joinCode))
      .unique();

    if (!org) {
      throw new ConvexError("Invalid join code");
    }

    await ctx.db.patch(worker._id, { organizationId: org._id });
    return null;
  },
});

export const removeWorkerFromOrganization = mutation({
  args: { workerId: v.id("workers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const worker = await ctx.db.get(args.workerId);
    if (!worker) {
      throw new ConvexError("Worker not found");
    }

    await ctx.db.patch(args.workerId, { organizationId: undefined });
    return null;
  },
});

export const regenerateJoinCode = mutation({
  args: { organizationId: v.id("organizations") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    let joinCode = generateJoinCode();
    while (
      await ctx.db
        .query("organizations")
        .withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode))
        .unique()
    ) {
      joinCode = generateJoinCode();
    }

    await ctx.db.patch(args.organizationId, { joinCode });
    return joinCode;
  },
});

export const updateOrgSettings = mutation({
  args: {
    organizationId: v.id("organizations"),
    locationIntervalMs: v.number(),
    historyIntervalMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.organizationId, {
      locationIntervalMs: args.locationIntervalMs,
      historyIntervalMs: args.historyIntervalMs,
    });
    return null;
  },
});

export const getMyOrgSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const worker = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!worker || !worker.organizationId) return null;

    const org = await ctx.db.get(
      worker.organizationId as Id<"organizations">
    );
    if (!org) return null;

    return {
      locationIntervalMs: org.locationIntervalMs ?? 10000,
      historyIntervalMs: org.historyIntervalMs ?? 10000,
    };
  },
});

export const updateOrganizationName = mutation({
  args: { organizationId: v.id("organizations"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.organizationId, { name: args.name });
    return null;
  },
});
