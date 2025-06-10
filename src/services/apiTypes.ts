
// API response types to handle the backend responses properly

export interface UserCheckResponse {
  user_exists: boolean;
  status_users?: string;
  level_id?: number;
  id?: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
}

export interface StockDataItem {
  stock_code: string;
  date: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
}
