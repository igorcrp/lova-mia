import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface DailyQueriesData {
  date: string;
  count: number;
}

const DAILY_LIMIT = 5;

export function useDailyQueries() {
  const { user } = useAuth();
  const [queriesUsed, setQueriesUsed] = useState(0);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const getTodayKey = () => {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  };

  const getStorageKey = () => {
    return user?.email ? `daily_queries_${user.email}` : 'daily_queries_anonymous';
  };

  const loadDailyQueries = () => {
    try {
      const storageKey = getStorageKey();
      const stored = localStorage.getItem(storageKey);
      const today = getTodayKey();

      if (stored) {
        const data: DailyQueriesData = JSON.parse(stored);
        
        // Check if it's the same day
        if (data.date === today) {
          setQueriesUsed(data.count);
          setIsLimitReached(data.count >= DAILY_LIMIT);
        } else {
          // New day, reset counter
          setQueriesUsed(0);
          setIsLimitReached(false);
          // Update storage with new date
          const newData: DailyQueriesData = { date: today, count: 0 };
          localStorage.setItem(storageKey, JSON.stringify(newData));
        }
      } else {
        // No stored data, start fresh
        setQueriesUsed(0);
        setIsLimitReached(false);
        const newData: DailyQueriesData = { date: today, count: 0 };
        localStorage.setItem(storageKey, JSON.stringify(newData));
      }
    } catch (error) {
      console.error('Error loading daily queries data:', error);
      setQueriesUsed(0);
      setIsLimitReached(false);
    } finally {
      setIsLoading(false);
    }
  };

  const incrementQueries = () => {
    const storageKey = getStorageKey();
    const today = getTodayKey();
    const newCount = queriesUsed + 1;
    
    setQueriesUsed(newCount);
    setIsLimitReached(newCount >= DAILY_LIMIT);
    
    const data: DailyQueriesData = { date: today, count: newCount };
    localStorage.setItem(storageKey, JSON.stringify(data));
  };

  const resetQueries = () => {
    const storageKey = getStorageKey();
    const today = getTodayKey();
    
    setQueriesUsed(0);
    setIsLimitReached(false);
    
    const data: DailyQueriesData = { date: today, count: 0 };
    localStorage.setItem(storageKey, JSON.stringify(data));
  };

  useEffect(() => {
    loadDailyQueries();
  }, [user?.email]);

  return {
    queriesUsed,
    queriesRemaining: DAILY_LIMIT - queriesUsed,
    dailyLimit: DAILY_LIMIT,
    isLimitReached,
    isLoading,
    incrementQueries,
    resetQueries
  };
}