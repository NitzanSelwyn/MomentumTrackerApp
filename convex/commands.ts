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

async function getWorkerByClerkId(ctx: QueryCtx | MutationCtx, clerkId: string) {
  return await ctx.db
    .query("workers")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

export const sendCommand = mutation({
  args: {
    workerId: v.id("workers"),
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
  },
  returns: v.id("workerCommands"),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const admin = await getWorkerByClerkId(ctx, identity.subject);

    if (!admin) {
      throw new ConvexError("Admin user not found");
    }

    if (admin.role !== "admin") {
      throw new ConvexError("Only admins can send commands");
    }

    return await ctx.db.insert("workerCommands", {
      workerId: args.workerId,
      fromAdminId: admin._id,
      type: args.type,
      message: args.message,
      soundType: args.soundType,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const getPendingCommands = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("workerCommands"),
      _creationTime: v.number(),
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
  ),
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    const worker = await getWorkerByClerkId(ctx, identity.subject);

    if (!worker) {
      return [];
    }

    return await ctx.db
      .query("workerCommands")
      .withIndex("by_workerId_status", (q) =>
        q.eq("workerId", worker._id).eq("status", "pending")
      )
      .collect();
  },
});

export const markDelivered = mutation({
  args: { commandId: v.id("workerCommands") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const command = await ctx.db.get(args.commandId);
    if (!command) {
      throw new ConvexError("Command not found");
    }
    await ctx.db.patch(args.commandId, {
      status: "delivered",
      deliveredAt: Date.now(),
    });
    return null;
  },
});

export const markAcknowledged = mutation({
  args: { commandId: v.id("workerCommands") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const command = await ctx.db.get(args.commandId);
    if (!command) {
      throw new ConvexError("Command not found");
    }
    await ctx.db.patch(args.commandId, {
      status: "acknowledged",
      acknowledgedAt: Date.now(),
    });
    return null;
  },
});

export const getCommandHistory = query({
  args: {
    workerId: v.id("workers"),
  },
  returns: v.array(
    v.object({
      _id: v.id("workerCommands"),
      _creationTime: v.number(),
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
      fromAdminName: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const commands = await ctx.db
      .query("workerCommands")
      .withIndex("by_workerId", (q) => q.eq("workerId", args.workerId))
      .order("desc")
      .take(50);

    const commandsWithAdmin = await Promise.all(
      commands.map(async (cmd) => {
        const admin = await ctx.db.get(cmd.fromAdminId);
        return {
          ...cmd,
          fromAdminName: admin?.name ?? "Unknown Admin",
        };
      })
    );

    return commandsWithAdmin;
  },
});
