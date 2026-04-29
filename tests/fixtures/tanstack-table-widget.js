// Realistic test: a React widget that imports a non-trivial npm package
// (@tanstack/react-table). Proves transitive imports survive the mountly
// loading pipeline whether the host map provides them or esm.sh dedupes
// them via ?deps. Pin the same React version both packages see, otherwise
// you'll hit the classic "two Reacts" dispatcher error.
import { createElement as h, useMemo, useState } from "https://esm.sh/react@19.2.5";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "https://esm.sh/@tanstack/react-table@8.21.3?deps=react@19.2.5";
import { createWidget } from "/packages/adapters/mountly-react/dist/index.js";

const sampleData = [
  { id: 1, name: "Alpha", score: 92 },
  { id: 2, name: "Beta",  score: 81 },
  { id: 3, name: "Gamma", score: 76 },
];

const columns = [
  { accessorKey: "id",    header: "ID" },
  { accessorKey: "name",  header: "Name" },
  { accessorKey: "score", header: "Score" },
];

function PeopleTable({ rows }) {
  const [data] = useState(() => rows ?? sampleData);
  const table = useReactTable({
    data,
    columns: useMemo(() => columns, []),
    getCoreRowModel: getCoreRowModel(),
  });

  return h(
    "table",
    { className: "tanstack-table" },
    h(
      "thead",
      null,
      table.getHeaderGroups().map((group) =>
        h(
          "tr",
          { key: group.id },
          group.headers.map((header) =>
            h(
              "th",
              { key: header.id },
              flexRender(header.column.columnDef.header, header.getContext()),
            ),
          ),
        ),
      ),
    ),
    h(
      "tbody",
      null,
      table.getRowModel().rows.map((row) =>
        h(
          "tr",
          { key: row.id, "data-row-id": row.original.id },
          row.getVisibleCells().map((cell) =>
            h(
              "td",
              { key: cell.id },
              flexRender(cell.column.columnDef.cell, cell.getContext()),
            ),
          ),
        ),
      ),
    ),
  );
}

export default createWidget(PeopleTable, {
  styles: `
    .tanstack-table { border-collapse: collapse; font-family: system-ui, sans-serif; }
    .tanstack-table th, .tanstack-table td {
      padding: 6px 12px;
      border: 1px solid rgb(220, 220, 230);
      text-align: left;
    }
    .tanstack-table th { background: rgb(245, 245, 250); font-weight: 600; }
  `,
});
