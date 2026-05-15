"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface UseResizableColumnsProps {
  columnCount: number;
  defaultWidths: number[];
  minWidth?: number;
  tableRef: React.RefObject<HTMLTableElement | null>;
}

export function useResizableColumns({
  columnCount,
  defaultWidths,
  minWidth = 40,
  tableRef,
}: UseResizableColumnsProps) {
  const [widths, setWidths] = useState<number[]>(defaultWidths);
  const dragging = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null);

  const onMouseDown = useCallback(
    (colIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = {
        colIndex,
        startX: e.clientX,
        startWidth: widths[colIndex],
      };

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!dragging.current) return;
        const diff = moveEvent.clientX - dragging.current.startX;
        const newWidth = Math.max(minWidth, dragging.current.startWidth + diff);
        setWidths((prev) => {
          const next = [...prev];
          next[dragging.current!.colIndex] = newWidth;
          return next;
        });
      };

      const onMouseUp = () => {
        dragging.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [widths, minWidth]
  );

  // Double-click to auto-fit column to content
  const onDoubleClick = useCallback(
    (colIndex: number) => {
      if (!tableRef.current) return;

      const rows = tableRef.current.querySelectorAll("tr");
      let maxWidth = minWidth;

      rows.forEach((row) => {
        const cell = row.children[colIndex] as HTMLElement;
        if (!cell) return;

        // Temporarily remove width constraint to measure natural content
        const oldWidth = cell.style.width;
        const oldMinWidth = cell.style.minWidth;
        cell.style.width = "auto";
        cell.style.minWidth = "auto";
        cell.style.whiteSpace = "nowrap";

        const contentWidth = cell.scrollWidth + 16; // +16 for padding
        maxWidth = Math.max(maxWidth, contentWidth);

        cell.style.width = oldWidth;
        cell.style.minWidth = oldMinWidth;
        cell.style.whiteSpace = "";
      });

      setWidths((prev) => {
        const next = [...prev];
        next[colIndex] = Math.min(maxWidth, 500); // cap at 500px
        return next;
      });
    },
    [tableRef, minWidth]
  );

  return { widths, onMouseDown, onDoubleClick };
}
