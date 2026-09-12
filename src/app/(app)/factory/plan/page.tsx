import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { cancelProductionPlan, closeProductionPlan } from "@/actions/factory";
import { requireUser } from "@/lib/auth";
import { formatDate, todayIST } from "@/lib/dates";
import { formatINR, formatQty } from "@/lib/money";
import { canEdit } from "@/lib/permissions";
import { BRAND_LABEL } from "@/lib/constants";
import { combineRequirements } from "@/lib/production-plan";
import { getProductOptions } from "@/lib/queries/common";
import { activeRecipes, planRows } from "@/lib/queries/factory";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, Section } from "@/components/app/page-header";
import { Stat, StatGrid } from "@/components/app/stat";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCard, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/app/data-table";
import { PlanDialog, type PlannerRecipe } from "./plan-dialogs";

export const metadata: Metadata = { title: "Production plan" };

export default async function ProductionPlanPage() {
  const user = await requireUser("factory");
  const today = todayIST();
  const editable = canEdit(user.role, "factory");
  const [open, closed, products, recipes] = await Promise.all([
    planRows({ status: ["open"], today }),
    planRows({ status: ["done", "cancelled"], today, limit: 10, recentFirst: true }),
    getProductOptions(),
    activeRecipes(),
  ]);

  const toMake = open.reduce((n, r) => n + r.remaining, 0);
  const shortPlans = open.filter((r) => r.shortCount > 0);
  const costToFinish = open.reduce((n, r) => n + r.remainingCostP, 0);
  const needed = combineRequirements(open.map((r) => r.requirement));
  const shortMaterials = needed.filter((r) => r.short > 0);
  const plannerRecipes: Record<string, PlannerRecipe> = Object.fromEntries([...recipes].map(([productId, r]) => [productId, { version: r.version, labourCostP: r.labourCostP, lines: r.lines }]));

  return (
    <>
      <PageHeader title="Production plan" description="What the factory intends to make, and whether the store can cover it." backHref="/factory" backLabel="Daily register">
        {editable ? <PlanDialog products={products} recipes={plannerRecipes} today={today} /> : null}
        <Link href="/factory/boms" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Material recipes
        </Link>
      </PageHeader>

      <StatGrid className="mb-6">
        <Stat label="Open plans" value={open.length} hint={open.filter((r) => r.overdue).length ? `${open.filter((r) => r.overdue).length} past their date` : undefined} tone={open.filter((r) => r.overdue).length ? "warning" : "primary"} />
        <Stat label="Pieces to make" value={toMake} hint={`${open.reduce((n, r) => n + r.awaitingQc, 0)} awaiting QC`} />
        <Stat label="Plans short of material" value={shortPlans.length} tone={shortPlans.length ? "warning" : "default"} />
        <Stat label="Material still needed" value={formatINR(costToFinish)} hint="at current purchase rates" />
      </StatGrid>

      <div className="space-y-8">
        <Section title="Open plans" description="Rejected pieces come back into the remaining quantity.">
          {open.length === 0 ? (
            <EmptyState title="Nothing planned" description="Plan a batch to check the materials before the team starts, and to follow it through QC.">
              {editable ? <PlanDialog products={products} recipes={plannerRecipes} today={today} /> : null}
            </EmptyState>
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Made</TableHead>
                    <TableHead className="text-right">Left</TableHead>
                    <TableHead>Materials</TableHead>
                    <TableHead className="hidden md:table-cell">Finish by</TableHead>
                    {editable ? <TableHead className="w-28" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {open.map((r) => (
                    <TableRow key={r.plan.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.plan.number}</TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {r.name}
                          {r.variant ? ` — ${r.variant}` : ""}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {BRAND_LABEL[r.plan.brandId] ?? r.plan.brandId}
                          {r.plan.note ? ` · ${r.plan.note}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="tabular text-right">{r.plan.qty}</TableCell>
                      <TableCell className="tabular text-right">
                        {r.accepted}
                        <span className="block text-xs font-normal text-muted-foreground">{r.awaitingQc ? `${r.awaitingQc} in QC` : r.rejected ? `${r.rejected} rejected` : "accepted"}</span>
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">{r.remaining}</TableCell>
                      <TableCell>
                        {!r.recipe ? (
                          <StatusBadge tone="neutral">No recipe</StatusBadge>
                        ) : r.shortCount ? (
                          <StatusBadge tone="warning">{r.shortCount} short</StatusBadge>
                        ) : (
                          <StatusBadge tone="success">Enough</StatusBadge>
                        )}
                        <span className="mt-0.5 block text-xs text-muted-foreground">{r.recipe ? formatINR(r.remainingCostP) : "add a recipe"}</span>
                      </TableCell>
                      <TableCell className={cn("hidden whitespace-nowrap md:table-cell", r.overdue && "font-medium text-warning")}>{formatDate(r.plan.targetDate, "d MMM")}</TableCell>
                      {editable ? (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <ConfirmAction trigger={<Button variant="ghost" size="xs" />} title={`Close ${r.plan.number}?`} description="Use this when the batch is finished or no longer needed. Production already recorded stays as it is." action={closeProductionPlan} hidden={{ id: r.plan.id }} confirmLabel="Close plan" withReason reasonLabel="Reason (optional)">
                              Close
                            </ConfirmAction>
                            {r.made === 0 ? (
                              <ConfirmAction trigger={<Button variant="ghost" size="xs" className="text-muted-foreground" />} title={`Cancel ${r.plan.number}?`} description="Nothing has been made against this plan yet." action={cancelProductionPlan} hidden={{ id: r.plan.id }} confirmLabel="Cancel plan" destructive withReason>
                                Cancel
                              </ConfirmAction>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
        </Section>

        {needed.length ? (
          <Section title="Materials for the whole plan" description="Every open plan added together, against what the store holds now." actions={<Link href="/factory/materials" className="text-sm text-primary hover:underline">Raw materials</Link>}>
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Needed</TableHead>
                    <TableHead className="text-right">In store</TableHead>
                    <TableHead className="text-right">Short</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Cost to buy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {needed.map((r) => (
                    <TableRow key={r.materialId}>
                      <TableCell className="font-medium">
                        <Link href={`/factory/materials/${r.materialId}`} className="hover:underline">
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular text-right">{formatQty(r.required, r.unit)}</TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">{formatQty(r.inStock)}</TableCell>
                      <TableCell className={cn("tabular text-right", r.short ? "font-semibold text-warning" : "text-muted-foreground")}>{r.short ? formatQty(r.short) : "—"}</TableCell>
                      <TableCell className="tabular hidden text-right sm:table-cell">{r.short ? formatINR(Math.round(r.short * r.unitCostP)) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
            {shortMaterials.length ? <p className="mt-2 text-xs text-muted-foreground">Buying the short quantities costs about {formatINR(shortMaterials.reduce((n, r) => n + Math.round(r.short * r.unitCostP), 0))} at the saved purchase rates.</p> : null}
          </Section>
        ) : null}

        {closed.length ? (
          <Section title="Recently closed">
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closed.length === 0 ? (
                    <TableEmpty colSpan={5}>Nothing closed yet.</TableEmpty>
                  ) : (
                    closed.map((r) => (
                      <TableRow key={r.plan.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.plan.number}</TableCell>
                        <TableCell>
                          {r.name}
                          {r.variant ? ` — ${r.variant}` : ""}
                        </TableCell>
                        <TableCell className="tabular text-right">{r.plan.qty}</TableCell>
                        <TableCell className="tabular text-right">{r.accepted}</TableCell>
                        <TableCell>
                          <StatusBadge tone={r.plan.status === "done" ? "success" : "neutral"}>{r.plan.status === "done" ? "Done" : "Cancelled"}</StatusBadge>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{r.plan.closeReason ?? ""}</span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableCard>
          </Section>
        ) : null}
      </div>
    </>
  );
}
