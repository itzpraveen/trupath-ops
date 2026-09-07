import { cn } from "cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };

export function TableCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto rounded-xl border bg-card", className)}>{children}</div>;
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

export function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("tabular", className)}>{children}</span>;
}
