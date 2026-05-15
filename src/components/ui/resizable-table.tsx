"use client";

import { useRef } from "react";
import { useResizableColumns } from "@/hooks/use-resizable-columns";

interface Column {
  key: string;
  label: string;
  defaultWidth: number;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  onSort?: () => void;
  sortIcon?: React.ReactNode;
}

interface ResizableTableProps {
  columns: Column[];
  children: (widths: number[]) => React.ReactNode;
  className?: string;
}

export function ResizableTable({
  columns,
  children,
  className = "",
}: ResizableTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const { widths, onMouseDown, onDoubleClick } = useResizableColumns({
    columnCount: columns.length,
    defaultWidths: columns.map((c) => c.defaultWidth),
    minWidth: 40,
    tableRef,
  });

  return (
    <div className="overflow-x-auto">
      <table ref={tableRef} className={`text-xs ${className}`} style={{ tableLayout: "fixed", width: widths.reduce((a, b) => a + b, 0) }}>
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-stone-50 border-b border-stone-200 text-[10px] text-stone-500 uppercase font-medium">
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={`px-2 py-2 relative select-none ${
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                    ? "text-center"
                    : "text-left"
                } ${col.sortable ? "cursor-pointer hover:text-stone-900" : ""}`}
                onClick={col.onSort}
              >
                <span className="flex items-center gap-1" style={{
                  justifyContent: col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start"
                }}>
                  {col.label}
                  {col.sortIcon}
                </span>
                {/* Resize handle */}
                <div
                  className="absolute top-0 right-0 bottom-0 w-[5px] cursor-col-resize hover:bg-amber-400/40 active:bg-amber-500/60 z-10"
                  onMouseDown={(e) => onMouseDown(i, e)}
                  onDoubleClick={() => onDoubleClick(i)}
                  title="Drag to resize, double-click to auto-fit"
                />
              </th>
            ))}
          </tr>
        </thead>
        {children(widths)}
      </table>
    </div>
  );
}
