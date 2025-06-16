
import React from 'react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DetailedResult, StockAnalysisParams, TradeHistoryItem } from '@/types';

interface StockDetailsTableProps {
  result: DetailedResult;
  params: StockAnalysisParams;
  onUpdateParams?: (params: StockAnalysisParams) => void;
  isLoading?: boolean;
}

const StockDetailsTable = ({ result, params, onUpdateParams, isLoading }: StockDetailsTableProps) => {
  const { tradeHistory } = result;

  const getActionDisplay = (action: string) => {
    switch (action) {
      case 'buy':
        return 'Buy';
      case 'sell':
        return 'Sell';
      default:
        return action;
    }
  };

  const getStopTriggerDisplay = (item: TradeHistoryItem) => {
    if (typeof item.price === 'number' && typeof params.stopLoss === 'number') {
      return item.price <= params.stopLoss ? "Yes" : "No";
    }
    return "No";
  };

  return (
    <Table>
      <TableCaption>Trade History</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Date</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Balance</TableHead>
          <TableHead>Stop Trigger</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tradeHistory && tradeHistory.map((item, index) => (
          <TableRow key={index}>
            <TableCell className="font-medium">{item.date}</TableCell>
            <TableCell>{getActionDisplay(item.action)}</TableCell>
            <TableCell>{item.price}</TableCell>
            <TableCell>{item.quantity}</TableCell>
            <TableCell>{item.value}</TableCell>
            <TableCell>{item.balance}</TableCell>
            <TableCell>{getStopTriggerDisplay(item)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default StockDetailsTable;
