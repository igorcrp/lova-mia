
import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TradeHistoryItem } from "@/types";

interface StockDetailsTableProps {
  data: TradeHistoryItem[];
}

const StockDetailsTable: React.FC<StockDetailsTableProps> = ({ data }) => {
  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Entry Price</TableHead>
            <TableHead>Exit Price</TableHead>
            <TableHead>Suggested Entry</TableHead>
            <TableHead>Actual Price</TableHead>
            <TableHead>Lot Size</TableHead>
            <TableHead>Stop Price</TableHead>
            <TableHead>Trade</TableHead>
            <TableHead>Stop</TableHead>
            <TableHead>Profit/Loss</TableHead>
            <TableHead>Capital</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.length ? (
            data.map((item, index) => (
              <TableRow key={index}>
                <TableCell>{item.date}</TableCell>
                <TableCell>{item.entryPrice}</TableCell>
                <TableCell>{item.exitPrice}</TableCell>
                <TableCell>{item.suggestedEntryPrice}</TableCell>
                <TableCell>{item.actualPrice}</TableCell>
                <TableCell>{item.lotSize}</TableCell>
                <TableCell>{item.stopPrice}</TableCell>
                <TableCell>{item.trade}</TableCell>
                <TableCell>{item.stopTrigger}</TableCell>
                <TableCell>
                  <span className={Number(item.profitLoss || 0) > 0 ? "text-green-600" : "text-red-600"}>
                    ${Number(item.profitLoss || 0).toFixed(2)}
                  </span>
                </TableCell>
                <TableCell>{item.currentCapital}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={11} className="h-24 text-center">
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
