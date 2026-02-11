import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import Purchases, { 
  PurchasesOfferings, 
  CustomerInfo, 
  PurchasesPackage,
  LOG_LEVEL,
  PurchasesError
} from 'react-native-purchases';

// RevenueCat API Keys
const REVENUECAT_API_KEY = 'test_chmuhTZoReRYWLbLxi0ISSoNHip'; // Test Store key

// Entitlement identifier for Chef Plan
const CHEF_PLAN_ENTITLEMENT = 'chef_plan';

interface RevenueCatContextType {
  isInitialized: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  isChefPlan: boolean;
  loading: boolean;
  purchasing: boolean;
  error: string | null;
  purchaseChefPlan: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshCustomerInfo: () => Promise<void>;
  identifyUser: (userId: string) => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(undefined);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user has Chef Plan entitlement
  const isChefPlan = customerInfo?.entitlements?.active?.[CHEF_PLAN_ENTITLEMENT] !== undefined;

  // Initialize RevenueCat on mount
  useEffect(() => {
    initializeRevenueCat();
  }, []);

  // Set up customer info listener
  useEffect(() => {
    if (!isInitialized) return;

    const customerInfoUpdateListener = Purchases.addCustomerInfoUpdateListener((info) => {
      console.log('Customer info updated:', info.entitlements.active);
      setCustomerInfo(info);
    });

    return () => {
      customerInfoUpdateListener.remove();
    };
  }, [isInitialized]);

  const initializeRevenueCat = async () => {
    try {
      // Skip on web for now (would need different setup)
      if (Platform.OS === 'web') {
        console.log('RevenueCat: Web platform - using mock mode');
        setIsInitialized(true);
        setLoading(false);
        return;
      }

      // Set log level for debugging
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);

      // Configure RevenueCat with API key
      await Purchases.configure({
        apiKey: REVENUECAT_API_KEY,
      });

      console.log('RevenueCat initialized successfully');
      setIsInitialized(true);

      // Fetch initial customer info and offerings
      await Promise.all([
        fetchCustomerInfo(),
        fetchOfferings(),
      ]);
    } catch (err: any) {
      console.error('RevenueCat initialization error:', err);
      setError(err.message || 'Failed to initialize purchases');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerInfo = async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      console.log('Customer info fetched:', info.entitlements.active);
    } catch (err: any) {
      console.error('Error fetching customer info:', err);
    }
  };

  const fetchOfferings = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      setOfferings(offerings);
      console.log('Offerings fetched:', offerings.current?.identifier);
    } catch (err: any) {
      console.error('Error fetching offerings:', err);
    }
  };

  const refreshCustomerInfo = useCallback(async () => {
    if (Platform.OS === 'web') return;
    await fetchCustomerInfo();
  }, []);

  const identifyUser = useCallback(async (userId: string) => {
    if (Platform.OS === 'web') return;
    
    try {
      const { customerInfo } = await Purchases.logIn(userId);
      setCustomerInfo(customerInfo);
      console.log('User identified:', userId);
    } catch (err: any) {
      console.error('Error identifying user:', err);
    }
  }, []);

  const purchaseChefPlan = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      // Web mock - show alert
      Alert.alert(
        'In-App Purchase',
        'In-app purchases are available on iOS and Android. Please download the mobile app to subscribe.',
        [{ text: 'OK' }]
      );
      return false;
    }

    if (!offerings?.current?.availablePackages?.length) {
      Alert.alert('Error', 'No subscription packages available. Please try again later.');
      return false;
    }

    setPurchasing(true);
    setError(null);

    try {
      // Get the first available package (Chef Plan monthly)
      const packageToPurchase = offerings.current.availablePackages[0];
      
      console.log('Attempting to purchase:', packageToPurchase.identifier);
      
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      
      setCustomerInfo(customerInfo);

      // Check if purchase was successful
      if (customerInfo.entitlements.active[CHEF_PLAN_ENTITLEMENT]) {
        console.log('Purchase successful! Chef Plan active.');
        return true;
      }

      return false;
    } catch (err: any) {
      // Handle user cancellation separately
      if (err.userCancelled) {
        console.log('User cancelled purchase');
        return false;
      }

      console.error('Purchase error:', err);
      setError(err.message || 'Purchase failed');
      Alert.alert('Purchase Error', err.message || 'Unable to complete purchase. Please try again.');
      return false;
    } finally {
      setPurchasing(false);
    }
  }, [offerings]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      Alert.alert('Restore Purchases', 'Please use the mobile app to restore purchases.');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const customerInfo = await Purchases.restorePurchases();
      setCustomerInfo(customerInfo);

      if (customerInfo.entitlements.active[CHEF_PLAN_ENTITLEMENT]) {
        Alert.alert('Success', 'Your Chef Plan subscription has been restored!');
        return true;
      } else {
        Alert.alert('No Purchases Found', 'No active subscriptions found for this account.');
        return false;
      }
    } catch (err: any) {
      console.error('Restore error:', err);
      setError(err.message || 'Failed to restore purchases');
      Alert.alert('Error', 'Unable to restore purchases. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <RevenueCatContext.Provider
      value={{
        isInitialized,
        customerInfo,
        offerings,
        isChefPlan,
        loading,
        purchasing,
        error,
        purchaseChefPlan,
        restorePurchases,
        refreshCustomerInfo,
        identifyUser,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (context === undefined) {
    throw new Error('useRevenueCat must be used within a RevenueCatProvider');
  }
  return context;
}

// Helper hook to get subscription status
export function useSubscriptionStatus() {
  const { isChefPlan, loading, customerInfo, refreshCustomerInfo } = useRevenueCat();
  
  return {
    isChefPlan,
    loading,
    expirationDate: customerInfo?.entitlements?.active?.[CHEF_PLAN_ENTITLEMENT]?.expirationDate,
    refresh: refreshCustomerInfo,
  };
}
