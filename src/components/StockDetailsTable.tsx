import React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TradeHistoryItem {
  date: string;
  entryPrice: number;
  exitPrice: number;
  profit?: number;
  profitLoss?: number;
  profitPercentage: number;
  trade: 'Executed' | 'Not Executed' | 'Buy' | 'Sell' | 'Close' | '-';
  stop?: 'Executed' | 'Close' | '-';
  stopTrigger?: 'Executed' | 'Close' | '-';
  volume?: number;
  high?: number;
  low?: number;
  suggestedEntryPrice?: number;
  actualPrice?: number | string;
  lotSize?: number;
  stopPrice?: number | string;
  capital?: number;
  currentCapital?: number;
}

interface StockDetailsTableProps {
  data: TradeHistoryItem[];
}

const columns: ColumnDef<TradeHistoryItem>[] = [
  {
    accessorKey: "date",
    header: "Date",
  },
  {
    accessorKey: "entryPrice",
    header: "Entry Price",
  },
  {
    accessorKey: "exitPrice",
    header: "Exit Price",
  },
  {
    accessorKey: "suggestedEntryPrice",
    header: "Suggested Entry",
  },
  {
    accessorKey: "actualPrice",
    header: "Actual Price",
  },
  {
    accessorKey: "lotSize",
    header: "Lot Size",
  },
  {
    accessorKey: "stopPrice",
    header: "Stop Price",
  },
  {
    accessorKey: "trade",
    header: "Trade",
  },
  {
    accessorKey: "stopTrigger",
    header: "Stop",
  },
  {
    accessorKey: "profitLoss",
    header: "Profit/Loss",
    cell: ({ row }) => {
      const item = row.original;
      return (
        <TableCell>
          {/* Fix type comparison by ensuring both are numbers */}
          <span className={Number(item.profitLoss) > 0 ? "text-green-600" : "text-red-600"}>
            ${Number(item.profitLoss).toFixed(2)}
          </span>
        </TableCell>
      );
    },
  },
  {
    accessorKey: "currentCapital",
    header: "Capital",
  },
];

const StockDetailsTable: React.FC<StockDetailsTableProps> = ({ data }) => {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}
                data-state={row.getIsSelected() && "selected"}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default StockDetailsTable;
