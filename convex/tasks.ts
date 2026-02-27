import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

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
  if (!worker || worker.role !== "admin") {
    throw new ConvexError("Admin access required");
  }
  return { identity, worker };
}

// ─── Date utilities ───────────────────────────────────────────────────────────

function formatDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function doesRuleApplyToDate(
  rule: {
    recurrenceType: string;
    weekdays?: number[];
    startDate: string;
    endDate?: string;
  },
  dateStr: string
): boolean {
  if (dateStr < rule.startDate) return false;
  if (rule.endDate && dateStr > rule.endDate) return false;

  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun…6=Sat

  switch (rule.recurrenceType) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekly":
      return rule.weekdays?.[0] === dow;
    case "custom":
      return rule.weekdays?.includes(dow) ?? false;
    default:
      return false;
  }
}

function getDaysInRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const cur = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (cur <= end) {
    days.push(formatDate(cur.getTime()));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

// ─── Task Template Queries ────────────────────────────────────────────────────

export const getTaskTemplates = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const worker = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!worker || !worker.organizationId) return [];

    const templates = await ctx.db
      .query("taskTemplates")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", worker.organizationId as Id<"organizations">)
      )
      .collect();

    return templates.sort((a, b) => a.title.localeCompare(b.title));
  },
});

// ─── Task Assignment Queries ──────────────────────────────────────────────────

export const getTasksForDateRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const caller = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || !caller.organizationId) return [];

    const orgId = caller.organizationId as Id<"organizations">;

    const assignments = await ctx.db
      .query("taskAssignments")
      .withIndex("by_organizationId_date", (q) =>
        q.eq("organizationId", orgId).gte("assignedDate", args.startDate)
      )
      .filter((q) => q.lte(q.field("assignedDate"), args.endDate))
      .collect();

    // Join with worker names
    const workerIds = [...new Set(assignments.map((a) => a.workerId))];
    const workerMap = new Map<string, string>();
    await Promise.all(
      workerIds.map(async (wId) => {
        const w = await ctx.db.get(wId);
        if (w) workerMap.set(wId, w.name);
      })
    );

    return assignments.map((a) => ({
      ...a,
      workerName: workerMap.get(a.workerId) ?? "Unknown",
    }));
  },
});

export const getMyTasksForToday = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const worker = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!worker) return [];

    const today = formatDate(Date.now());

    const assignments = await ctx.db
      .query("taskAssignments")
      .withIndex("by_workerId_date", (q) =>
        q.eq("workerId", worker._id).eq("assignedDate", today)
      )
      .collect();

    const statusOrder: Record<string, number> = {
      pending: 0,
      in_progress: 1,
      completed: 2,
      skipped: 3,
    };
    return assignments.sort(
      (a, b) => (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4)
    );
  },
});

// ─── Recurring Rule Queries ───────────────────────────────────────────────────

export const getRecurringRules = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const worker = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!worker || !worker.organizationId) return [];

    return await ctx.db
      .query("recurringTaskRules")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", worker.organizationId as Id<"organizations">)
      )
      .collect();
  },
});

// ─── Task Template Mutations (Admin only) ─────────────────────────────────────

export const createTaskTemplate = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  returns: v.id("taskTemplates"),
  handler: async (ctx, args) => {
    const { worker } = await requireAdmin(ctx);
    if (!worker.organizationId) throw new ConvexError("No organization found");

    return await ctx.db.insert("taskTemplates", {
      organizationId: worker.organizationId as Id<"organizations">,
      title: args.title,
      description: args.description,
      estimatedMinutes: args.estimatedMinutes,
      category: args.category,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateTaskTemplate = mutation({
  args: {
    templateId: v.id("taskTemplates"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { templateId, ...updates } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.estimatedMinutes !== undefined) patch.estimatedMinutes = updates.estimatedMinutes;
    if (updates.category !== undefined) patch.category = updates.category;
    await ctx.db.patch(templateId, patch);
    return null;
  },
});

export const deleteTaskTemplate = mutation({
  args: { templateId: v.id("taskTemplates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.templateId);
    return null;
  },
});

// ─── Task Assignment Mutations ────────────────────────────────────────────────

export const createTaskAssignments = mutation({
  args: {
    workerIds: v.array(v.id("workers")),
    assignedDate: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    taskTemplateId: v.optional(v.id("taskTemplates")),
  },
  returns: v.array(v.id("taskAssignments")),
  handler: async (ctx, args) => {
    const { worker } = await requireAdmin(ctx);
    if (!worker.organizationId) throw new ConvexError("No organization found");

    const orgId = worker.organizationId as Id<"organizations">;
    const now = Date.now();

    const ids = await Promise.all(
      args.workerIds.map((wId) =>
        ctx.db.insert("taskAssignments", {
          organizationId: orgId,
          workerId: wId,
          assignedDate: args.assignedDate,
          title: args.title,
          description: args.description,
          estimatedMinutes: args.estimatedMinutes,
          taskTemplateId: args.taskTemplateId,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        })
      )
    );

    return ids;
  },
});

export const updateTaskAssignment = mutation({
  args: {
    assignmentId: v.id("taskAssignments"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("skipped")
      )
    ),
    notes: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const caller = await ctx.db
      .query("workers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller) throw new ConvexError("Worker not found");

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new ConvexError("Assignment not found");

    if (caller.role !== "admin" && caller._id !== assignment.workerId) {
      throw new ConvexError("Not authorized");
    }

    const { assignmentId, ...updates } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.estimatedMinutes !== undefined) patch.estimatedMinutes = updates.estimatedMinutes;
    if (updates.status !== undefined) {
      patch.status = updates.status;
      if (updates.status === "completed") {
        patch.completedAt = Date.now();
      }
    }

    await ctx.db.patch(assignmentId, patch);
    return null;
  },
});

export const deleteTaskAssignment = mutation({
  args: { assignmentId: v.id("taskAssignments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.assignmentId);
    return null;
  },
});

// ─── Recurring Rule Mutations ─────────────────────────────────────────────────

export const createRecurringRule = mutation({
  args: {
    workerIds: v.array(v.id("workers")),
    title: v.string(),
    description: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    taskTemplateId: v.optional(v.id("taskTemplates")),
    recurrenceType: v.union(
      v.literal("daily"),
      v.literal("weekdays"),
      v.literal("weekly"),
      v.literal("custom")
    ),
    weekdays: v.optional(v.array(v.number())),
    startDate: v.string(),
    endDate: v.optional(v.string()),
  },
  returns: v.id("recurringTaskRules"),
  handler: async (ctx, args) => {
    const { worker } = await requireAdmin(ctx);
    if (!worker.organizationId) throw new ConvexError("No organization found");

    return await ctx.db.insert("recurringTaskRules", {
      organizationId: worker.organizationId as Id<"organizations">,
      workerIds: args.workerIds,
      title: args.title,
      description: args.description,
      estimatedMinutes: args.estimatedMinutes,
      taskTemplateId: args.taskTemplateId,
      recurrenceType: args.recurrenceType,
      weekdays: args.weekdays,
      startDate: args.startDate,
      endDate: args.endDate,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateRecurringRule = mutation({
  args: {
    ruleId: v.id("recurringTaskRules"),
    workerIds: v.optional(v.array(v.id("workers"))),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    recurrenceType: v.optional(
      v.union(
        v.literal("daily"),
        v.literal("weekdays"),
        v.literal("weekly"),
        v.literal("custom")
      )
    ),
    weekdays: v.optional(v.array(v.number())),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { ruleId, ...updates } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.workerIds !== undefined) patch.workerIds = updates.workerIds;
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.estimatedMinutes !== undefined) patch.estimatedMinutes = updates.estimatedMinutes;
    if (updates.recurrenceType !== undefined) patch.recurrenceType = updates.recurrenceType;
    if (updates.weekdays !== undefined) patch.weekdays = updates.weekdays;
    if (updates.startDate !== undefined) patch.startDate = updates.startDate;
    if (updates.endDate !== undefined) patch.endDate = updates.endDate;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;
    await ctx.db.patch(ruleId, patch);
    return null;
  },
});

export const deleteRecurringRule = mutation({
  args: { ruleId: v.id("recurringTaskRules") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.ruleId);
    return null;
  },
});

// ─── Materialization ──────────────────────────────────────────────────────────

export const ensureRecurringAssignments = mutation({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { worker } = await requireAdmin(ctx);
    if (!worker.organizationId) return 0;

    const orgId = worker.organizationId as Id<"organizations">;

    const rules = await ctx.db
      .query("recurringTaskRules")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", orgId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const days = getDaysInRange(args.startDate, args.endDate);
    const now = Date.now();
    let created = 0;

    for (const rule of rules) {
      for (const dateStr of days) {
        if (!doesRuleApplyToDate(rule, dateStr)) continue;

        for (const wId of rule.workerIds) {
          const existing = await ctx.db
            .query("taskAssignments")
            .withIndex("by_workerId_date", (q) =>
              q.eq("workerId", wId).eq("assignedDate", dateStr)
            )
            .filter((q) => q.eq(q.field("recurringRuleId"), rule._id))
            .first();

          if (!existing) {
            await ctx.db.insert("taskAssignments", {
              organizationId: orgId,
              workerId: wId,
              assignedDate: dateStr,
              title: rule.title,
              description: rule.description,
              estimatedMinutes: rule.estimatedMinutes,
              taskTemplateId: rule.taskTemplateId,
              recurringRuleId: rule._id,
              status: "pending",
              createdAt: now,
              updatedAt: now,
            });
            created++;
          }
        }
      }
    }

    return created;
  },
});
